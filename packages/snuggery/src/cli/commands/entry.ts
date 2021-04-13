import {isJsonArray} from '@angular-devkit/core';
import {Option} from 'clipanion';

import {ArchitectCommand, configurationOption} from '../command/architect';

export class EntryCommand extends ArchitectCommand {
  static paths = [ArchitectCommand.Default];

  static usage = ArchitectCommand.Usage({
    category: 'Architect commands',
    description: 'Run a target in the current project',
    details: `
      Execute a target without specifying a project. Snuggery looks for the project to run the target in:

      - If the command is executed from within a project that has the requested target, the target is executed in that project.
      - If the workspace has a default project and that project has the requested target, the target is executed in the default project.
      - If there's only one project in the entire workspace that has the requested target, the target is executed in that project.

      A list of all targets you can run without specifying the project is shown when you run \`sn help targets\`.

      This command allows overriding configured options. To see what options are available for a target, run \`sn <target> --help\`.
    `,
    examples: [
      ['Run the `build` target', '$0 build'],
      [
        'Run the `build` target with the `production` configuration',
        '$0 build --configuration production',
      ],
      [
        'Run the `build` target with the `production` and `french` configurations',
        '$0 build --configuration production --configuration french',
      ],
      [
        'Run the `build` target with the `production` and `french` configurations',
        '$0 build --configuration production,french',
      ],
      [
        'Run the `serve` target, set `open` to true and set the `baseHref` to `/lorem/`',
        '$0 serve --open --base-href /lorem/',
      ],
      [
        'Show all options to the `test` target that can be passed via commandline arguments',
        '$0 test --help',
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
    const configurations = new Set(
      this.configuration?.flatMap(c => c.split(',')),
    );

    const options = this.parseOptionValues({
      ...(await this.getOptionsForTarget(target)),
      description: `Run the \`${this.format.code(
        target.target,
      )}\` target in project \`${this.format.code(target.project)}\``,
      commandOptions: [configurationOption],
      pathSuffix: [this.target],
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
