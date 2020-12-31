import {JsonObject, JsonValue} from '@angular-devkit/core';
import {camelize, dasherize} from '@angular-devkit/core/src/utils/strings';
import {Cli, CliOptions, Command} from 'clipanion';
import {parse as parseJson} from 'json5';

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
      const value =
        equals > -1 ? current.slice(equals + 1) : values[++i] ?? true;
      const name =
        equals > -1 ? current.slice(2, equals - 1) : current.slice(2);

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

export function parseOptions({
  baseCli,
  path,
  options,
  allowExtraOptions,
  values,
}: {
  readonly baseCli: CliOptions;
  readonly path: string[];
  readonly options: Option[];
  readonly allowExtraOptions: boolean;
  readonly values: string[];
}): JsonObject {
  class OptionParserCommand extends Command {
    public readonly value: JsonObject = {};

    @Command.Path(...path)
    execute(): never {
      throw new Error('Never called');
    }
  }

  let restOption: Option | null = null;

  for (const option of options) {
    if (option.name === '--') {
      restOption = option;
      continue;
    }

    const key = `option_${option.name}`;

    if (option.type === Type.Boolean) {
      Object.defineProperty(OptionParserCommand.prototype, key, {
        set(value: boolean) {
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

    const names = [option.name, ...option.aliases]
      .map(f => dasherize(f))
      .map(f => (f.length > 1 ? `--${f}` : `-${f}`))
      .join(',');

    let decorator;
    switch (option.type) {
      case Type.Boolean:
        decorator = Command.Boolean(names, {
          description,
          hidden,
        });
        break;
      case Type.StringArray:
        decorator = Command.Array(names, {description, hidden});
        break;
      case Type.String:
      case Type.Number:
      case Type.Object:
      default:
        decorator = Command.String(names, {
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
  } else if (allowExtraOptions) {
    Object.defineProperty(OptionParserCommand.prototype, 'rest', {
      set(this: OptionParserCommand, value: string[]) {
        Object.assign(this.value, parseFreeFormArguments(value));
      },
    });

    OptionParserCommand.addOption('rest', Command.Proxy());
  }

  const cli = Cli.from([OptionParserCommand], baseCli);
  const command = cli.process([...path, ...values]);

  if (!(command instanceof OptionParserCommand)) {
    throw new Error(`Invalid result returned by inner cli`);
  }

  return command.value;
}
