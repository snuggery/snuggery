import {isJsonArray} from '@angular-devkit/core';
import {Option} from 'clipanion';

import {ArchitectCommand, configurationOption} from '../command/architect';

export class EntryWithProjectCommand extends ArchitectCommand {
  static paths = [ArchitectCommand.Default];

  static usage = ArchitectCommand.Usage({
    category: 'Architect commands',
    description: 'Run a target in a project',
    details: `
      Execute a target in the specified project.

      This command allows overriding configured options. To see what options are available for a target, run \`sn <target> <project> --help\`.
    `,
    examples: [
      [
        'Run the `build` target in the `application` project',
        '$0 build application',
      ],
      [
        'Run the `build` target with the `production` configuration in the `application` project',
        '$0 build application --configuration production',
      ],
      [
        'Run the `build` target in the `application` project with the `production` and `french` configurations',
        '$0 build application --configuration production --configuration french',
      ],
      [
        'Run the `build` target in the `application` project with the `production` and `french` configurations',
        '$0 build application --configuration production,french',
      ],
      [
        'Run the `serve` target in the `app` project, set `open` to true and set the `baseHref` to `/lorem/`',
        '$0 serve app --open --base-href /lorem/',
      ],
      [
        'Show all options to the `test` target in the `app` project that can be passed via commandline arguments',
        '$0 test app --help',
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

    if (!options[0]) {
      return 1;
    } else if (options[1] == null) {
      return 0;
    }

    if (typeof options[1].configuration === 'string') {
      for (const value of options[1].configuration.split(',')) {
        if (value) {
          configurations.add(value);
        }
      }
      delete options[1].configuration;
    } else if (isJsonArray(options[1].configuration!)) {
      for (const value of options[1].configuration) {
        if (typeof value === 'string') {
          configurations.add(value);
        }
      }
      delete options[1].configuration;
    }

    if (configurations.size > 0) {
      target.configuration = Array.from(configurations).join(',');
    }

    return this.runTarget({
      target,
      options: options[1],
    });
  }
}
