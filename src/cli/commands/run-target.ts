import {targetFromTargetString} from '@angular-devkit/architect';
import type {JsonObject} from '@angular-devkit/core';

import {ArchitectCommand} from '../command/architect';
import {parseFreeFormArguments, parseOptions} from '../utils/parse-options';

export class RunTargetCommand extends ArchitectCommand {
  static usage = ArchitectCommand.Usage({
    category: 'Architect commands',
    description: 'Run a target by specifier',
    examples: [
      [
        'Run the `build` target in the `application` project',
        '$0 run target application:build',
      ],
      [
        'Run the `build` target with the `production` configuration in the `application` project',
        '$0 run target application:build:production',
      ],
      ['Run the `test` target in the current project', '$0 run target test'],
    ],
  });

  @ArchitectCommand.String()
  specifier!: string;

  @ArchitectCommand.Proxy()
  args = [] as string[];

  @ArchitectCommand.Path('run')
  @ArchitectCommand.Path('run', 'target')
  async execute(): Promise<number> {
    let target;
    if (this.specifier.includes(':')) {
      target = targetFromTargetString(this.specifier);
    } else {
      target = this.resolveTarget(this.specifier, null);
    }

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
        description: `Run the \`${this.specifier}\` target`,
        options: definedOptions,
        path: [...this.path, this.specifier],
        values: this.args,
      });

      if (o === null) {
        return 1;
      }

      options = o;
    }

    return this.runTarget({
      target,
      options,
    });
  }
}
