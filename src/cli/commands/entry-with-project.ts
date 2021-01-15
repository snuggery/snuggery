import {isJsonArray} from '@angular-devkit/core';
import {Option} from 'clipanion';

import {ArchitectCommand, configurationOption} from '../command/architect';

export class EntryWithProjectCommand extends ArchitectCommand {
  static paths = [ArchitectCommand.Default];

  static usage = ArchitectCommand.Usage({
    category: 'Architect commands',
    description: 'Run a target in a project',
    examples: [
      [
        'Run the `build` target in the `application` project',
        '$0 build application',
      ],
      [
        'Run the `build` target with the `production` configuration in the `application` project',
        '$0 build application --configuration production',
      ],
    ],
  });

  target = Option.String();

  project = Option.String();

  configuration = Option.Array('--configuration,-c', {
    description: 'Configuration(s) to use',
  });

  args = Option.Proxy();

  async execute(): Promise<number> {
    const target = this.resolveTarget(this.target, this.project);
    const configurations = new Set(this.configuration);

    const options = this.parseOptionValues({
      ...(await this.getOptionsForTarget(target)),
      description: `Run the \`${target.target}\` target in the \`${target.project}\` project`,
      commandOptions: [configurationOption],
      pathSuffix: [this.target, this.project],
      values: this.args,
    });

    if (options == null) {
      return 1;
    }

    if (isJsonArray(options.configuration!)) {
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
