import {isJsonArray, JsonObject} from '@angular-devkit/core';
import {Option} from 'clipanion';

import {ArchitectCommand, configurationOption} from '../command/architect';
import {parseFreeFormArguments, parseOptions} from '../utils/parse-options';

export class EntryCommand extends ArchitectCommand {
  static paths = [ArchitectCommand.Default];

  static usage = ArchitectCommand.Usage({
    category: 'Architect commands',
    description: 'Run a target in the current project',
    examples: [
      ['Run the `build` target in the current project', '$0 build'],
      [
        'Run the `build` target with the `production` configuration in the current project',
        '$0 build --configuration production',
      ],
    ],
  });

  target = Option.String();

  configuration = Option.Array('--configuration,-c', {
    description: 'Configuration(s) to use',
  });

  args = Option.Proxy();

  async execute(): Promise<number> {
    const target = this.resolveTarget(this.target, null);
    const configurations = new Set(this.configuration);

    const {
      allowExtraOptions,
      options: definedOptions,
    } = await this.getOptionsForTarget(target);

    let options: JsonObject | undefined;
    if (definedOptions.length === 0) {
      if (allowExtraOptions) {
        options = parseFreeFormArguments(this.args);
      }
    } else {
      const o = parseOptions({
        command: this,
        description: `Run the \`${this.format.code(
          target.target,
        )}\` target in project \`${this.format.code(target.project)}\``,
        options: [configurationOption, ...definedOptions],
        path: [this.target],
        values: this.args,
      });

      if (o === null) {
        return 1;
      }

      options = o;
    }

    if (options != null && isJsonArray(options.configuration!)) {
      for (const value of options.configuration) {
        if (typeof value === 'string') {
          configurations.add(value);
        }
      }
      delete options.configuration;
    }

    if (configurations.size > 0) {
      target.configuration = Array.from(configurations).join(',');
    }

    return this.runTarget({
      target,
      options,
    });
  }
}
