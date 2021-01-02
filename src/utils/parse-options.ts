import {JsonObject, JsonValue} from '@angular-devkit/core';
import {camelize, dasherize} from '@angular-devkit/core/src/utils/strings';
import {Cli, Command} from 'clipanion';
import {parse as parseJson} from 'json5';
import {AbstractCommand} from '../command/abstract-command';

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

        let next = values[i + 1];
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
  class OptionParserCommand extends Command {
    static usage = description ? {description} : undefined;

    public readonly value: JsonObject = {};

    @Command.Boolean('--help,-h', {description: 'Show this help message'})
    public help = false;

    @Command.Path()
    execute(): never {
      throw new Error('Never called');
    }
  }

  const claimedNames = new Set(
    reservedNames
      ? [...reservedNames, ...globalReservedNames]
      : globalReservedNames,
  );

  let restOption: Option | null = null;

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

    const key = `option_${option.name}`;

    if (option.type === Type.Boolean) {
      Object.defineProperty(OptionParserCommand.prototype, key, {
        set(value: boolean) {
          this.value[option.name] = value;
        },
      });
    } else if (option.type === Type.StringArray) {
      Object.defineProperty(OptionParserCommand.prototype, key, {
        get() {
          return (this.value[option.name] ??= []);
        },
        set(value: string) {
          this.value[option.name] = value;
        },
      });
    } else {
      let parse: (value: string) => JsonValue;

      switch (option.type) {
        case Type.Number:
          parse = value => Number.parseFloat(value);
          break;
        case Type.Object:
          parse = value => parseJson(value);
          break;
        default:
          parse = value => value;
      }

      Object.defineProperty(OptionParserCommand.prototype, key, {
        set(value: string) {
          this.value[option.name] = parse(value);
        },
      });
    }

    const {hidden, description} = option;

    for (const name of names) {
      claimedNames.add(name);
    }

    let decorator;
    switch (option.type) {
      case Type.Boolean:
        decorator = Command.Boolean(names.join(','), {
          description,
          hidden,
        });
        break;
      case Type.StringArray:
        decorator = Command.Array(names.join(','), {description, hidden});
        break;
      case Type.String:
      case Type.Number:
      case Type.Object:
      default:
        decorator = Command.String(names.join(','), {
          description,
          hidden,
          tolerateBoolean:
            option.type === Type.String &&
            option.extraTypes?.includes(Type.Boolean),
        });
        break;
    }

    OptionParserCommand.addOption(key, decorator);
  }

  if (restOption != null) {
    const {name} = restOption;
    const key = `option_${name}`;

    Object.defineProperty(OptionParserCommand.prototype, key, {
      set(this: OptionParserCommand, value: JsonValue) {
        this.value[name] = value;
      },
    });

    OptionParserCommand.addOption(key, Command.Rest());
  }

  const cli = Cli.from([OptionParserCommand], {
    ...baseCli,
    binaryName: `${baseCli.binaryName} ${path.join(' ')}`,
  });
  const command = cli.process(values);

  if (command.help) {
    context.stderr.write(cli.usage(OptionParserCommand, {detailed: true}));

    return null;
  }

  if (!(command instanceof OptionParserCommand)) {
    throw new Error(`Invalid result returned by inner cli`);
  }

  return command.value;
}
