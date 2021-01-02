import {targetFromTargetString} from '@angular-devkit/architect';
import {JsonObject} from '@angular-devkit/core';
import {UsageError} from 'clipanion';
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
    ],
  });

  @ArchitectCommand.String({
    required: true,
  })
  public specifier?: string;

  @ArchitectCommand.Proxy()
  public args = [] as string[];

  @ArchitectCommand.Path('run')
  @ArchitectCommand.Path('run', 'target')
  async execute() {
    if (this.specifier == null) {
      const err = new UsageError(`Missing parameter target`);
      err.clipanion.type = 'usage';
      throw err;
    }

    const target = targetFromTargetString(this.specifier);

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
