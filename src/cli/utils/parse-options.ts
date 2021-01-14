import type {JsonObject, JsonValue} from '@angular-devkit/core';
import {camelize, dasherize} from '@angular-devkit/core/src/utils/strings';
import {Cli, Command, Option as CommandOption} from 'clipanion';
import {parse as parseJson} from 'json5';
import * as t from 'typanion';

import type {AbstractCommand} from '../command/abstract-command';

import {Option, Type} from './parse-schema';

export function parseFreeFormArguments(values: string[]): JsonObject {
  const result: JsonObject = {};
  const leftOvers: string[] = [];

  for (let i = 0, {length} = values; i < length; i++) {
    const current = values[i]!;

    if (current === '--') {
      leftOvers.push(...values.slice(i + 1));
      break;
    }

    if (current.startsWith('--')) {
      const equals = current.indexOf('=');

      let value: JsonValue;
      let name: string;
      if (equals > -1) {
        name = current.slice(2, equals);
        value = current.slice(equals + 1);
      } else {
        name = current.slice(2);

        const next = values[i + 1];
        if (!next || next.startsWith('-')) {
          value = true;
        } else {
          value = next;
          i++;
        }
      }

      if (value === 'true' || value === 'false') {
        value = value === 'true';
      } else if (
        typeof value === 'string' &&
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        !isNaN(value as any) &&
        !isNaN(parseFloat(value))
      ) {
        value = parseFloat(value);
      }

      result[camelize(name)] = value;
    } else if (current.startsWith('-')) {
      for (const flag of current.slice(1)) {
        result[flag] = true;
      }
    } else {
      leftOvers.push(current);
    }
  }

  if (leftOvers.length) {
    result['--'] = leftOvers;
  }

  return result;
}

const globalReservedNames = new Set(['--help', '-h']);

class HelpCommand extends Command {
  static paths = [['-h'], ['--help']];

  execute(): never {
    throw new Error(`Never called`);
  }
}

const isJSON5 = () =>
  t.makeValidator<unknown, JsonObject>({
    test: (value: unknown, state): value is JsonObject => {
      let data;

      try {
        data = parseJson(value as string);

        if (state?.coercions != null && state.coercion != null) {
          state.coercions.push([
            state.p ?? '.',
            state.coercion.bind(null, data),
          ]);
        }

        return true;
      } catch {
        return t.pushError(
          state,
          `Expected to be a valid JSON5 string (got ${t.getPrintable(value)})`,
        );
      }
    },
  });

export function parseOptions({
  command: {context, cli: baseCli},
  path,
  description,
  options,
  values,
  reservedNames,
}: {
  readonly command: AbstractCommand;
  readonly path: string[];
  readonly description?: string;
  readonly options: Option[];
  readonly values: string[];
  readonly reservedNames?: ReadonlySet<string>;
}): JsonObject | null {
  const commandKeyToOptionNameMap = new Map<string, string>();

  class OptionParserCommand extends Command {
    static paths = [Command.Default];

    static usage = description ? {description} : undefined;

    help = CommandOption.Boolean('--help,-h', false, {
      description: 'Show this help message',
    });

    constructor() {
      super();

      const claimedNames = new Set(
        reservedNames
          ? [...reservedNames, ...globalReservedNames]
          : globalReservedNames,
      );

      let restOption: Option | null = null;

      const self = (this as unknown) as Record<string, JsonValue | undefined>;

      for (const option of options) {
        if (option.name === '--') {
          restOption = option;
          continue;
        }

        const names = Array.from(new Set([option.name, ...option.aliases]))
          .map(f => dasherize(f))
          .map(f => (f.length > 1 ? `--${f}` : `-${f}`))
          .filter(name => !claimedNames.has(name));

        if (names.length === 0) {
          // All names of this option have already been claimed, that's too bad
          continue;
        }

        const {hidden, description, name} = option;
        const key = `option_${name}`;
        commandKeyToOptionNameMap.set(key, name);

        for (const name of names) {
          claimedNames.add(name);
        }

        let cliOption: JsonValue | undefined;

        if (option.type === Type.Boolean) {
          cliOption = CommandOption.Boolean(names.join(','), {
            description,
            hidden,
          });
        } else if (option.type === Type.StringArray) {
          cliOption = CommandOption.Array(names.join(','), {
            description,
            hidden,
          });
        } else {
          let validator: t.StrictValidator<unknown, JsonValue> | undefined;

          switch (option.type) {
            case Type.Number:
              validator = t.isNumber();
              break;
            case Type.Object:
              validator = isJSON5();
              break;
          }

          cliOption = CommandOption.String(names.join(','), {
            description,
            hidden,
            validator,
            tolerateBoolean: option.extraTypes?.includes(Type.Boolean) ?? false,
          });
        }

        self[key] = cliOption;
      }

      if (restOption != null) {
        const restKey = `option_${restOption.name}`;
        commandKeyToOptionNameMap.set(restKey, restOption.name);

        self[restKey] = CommandOption.Rest({name: restOption.name});
      }
    }

    get value(): JsonObject {
      const self = (this as unknown) as Record<string, JsonValue | undefined>;

      const res = Object.fromEntries(
        Array.from(commandKeyToOptionNameMap)
          .filter(([key]) => self[key] !== undefined)
          .map(([key, name]) => [name, self[key]!]),
      );

      console.log(res);

      return res;
    }

    execute(): never {
      throw new Error('Never called');
    }
  }

  const cli = Cli.from([OptionParserCommand, HelpCommand], {
    ...baseCli,
    binaryName: `${baseCli.binaryName} ${path.join(' ')}`,
  });
  const command = cli.process(values);

  if (command instanceof HelpCommand || command.help) {
    context.stderr.write(cli.usage(OptionParserCommand, {detailed: true}));

    return null;
  }

  if (!(command instanceof OptionParserCommand)) {
    throw new Error(`Invalid result returned by inner cli`);
  }

  return command.value;
}
