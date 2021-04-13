import type {JsonObject, JsonValue} from '@angular-devkit/core';
import {camelize, dasherize} from '@angular-devkit/core/src/utils/strings';
import {Cli, Command, Option as CommandOption} from 'clipanion';

import type {AbstractCommand} from '../command/abstract-command';

import {Option, Type} from './parse-schema';
import * as t from './typanion';

export type ParsedArguments =
  | [success: true, value: JsonObject | null]
  | [success: false, value: void];

const globalReservedNames = new Set(['--help', '-h']);

function createOptionParserCommand({
  path = Command.Default,
  description,
}: {
  path?: readonly string[];
  description?: string;
}) {
  return class OptionParserCommand extends Command {
    static paths = [[...path]];

    static usage = description ? {description} : undefined;

    help = CommandOption.Boolean('--help,-h', false, {
      description: 'Show this help message',
    });

    execute(): never {
      throw new Error('Never called');
    }
  };
}

export function parseFreeFormArguments({
  command: {context, cli: baseCli},
  path,
  values,
  description,
}: {
  readonly command: AbstractCommand;
  readonly path: readonly string[];
  readonly description?: string;
  readonly values: readonly string[];
}): ParsedArguments {
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

  if ((result.help ?? result.h) !== true) {
    return [true, result];
  }

  class OptionParserCommand extends createOptionParserCommand({
    path,
    description,
  }) {
    rest = CommandOption.Proxy();
  }

  const cli = Cli.from([OptionParserCommand], {
    ...baseCli,
  });

  context.stderr.write(cli.usage(OptionParserCommand, {detailed: true}));

  return [true, null];
}

export function parseOptions({
  command: {context, cli: baseCli},
  path,
  description,
  options,
  values,
  reservedNames,
}: {
  readonly command: AbstractCommand;
  readonly path: readonly string[];
  readonly description?: string;
  readonly options: readonly Option[];
  readonly values: readonly string[];
  readonly reservedNames?: ReadonlySet<string>;
}): ParsedArguments {
  const commandKeyToOptionNameMap = new Map<string, string>();

  class OptionParserCommand extends createOptionParserCommand({
    path,
    description,
  }) {
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

          if (option.enum != null) {
            validator = t.isEnum(option.enum);
          } else {
            switch (option.type) {
              case Type.Number:
                validator = t.isNumber();
                break;
              case Type.Object:
                validator = t.isJSON5();
                break;
            }
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

      return res;
    }
  }

  class HelpCommand extends Command {
    static paths = [
      [...path, '-h'],
      [...path, '--help'],
    ];

    execute(): never {
      throw new Error(`Never called`);
    }
  }

  const cli = Cli.from([OptionParserCommand, HelpCommand], {
    ...baseCli,
  });
  let command;

  try {
    command = cli.process([...path, ...values]);
  } catch (e) {
    context.stderr.write(cli.error(e));

    return [false, undefined];
  }

  if (command instanceof HelpCommand || command.help) {
    context.stderr.write(cli.usage(OptionParserCommand, {detailed: true}));

    return [true, null];
  }

  if (!(command instanceof OptionParserCommand)) {
    throw new Error(`Invalid result returned by inner cli`);
  }

  return [true, command.value];
}
