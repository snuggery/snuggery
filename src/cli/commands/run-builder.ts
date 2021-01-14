import type {JsonObject} from '@angular-devkit/core';
import {Option, UsageError} from 'clipanion';

import {ArchitectCommand} from '../command/architect';
import {parseFreeFormArguments, parseOptions} from '../utils/parse-options';

export class RunBuilderCommand extends ArchitectCommand {
  static paths = [['run', 'builder']];

  static usage = ArchitectCommand.Usage({
    category: 'Architect commands',
    description: 'Run a builder by name',
    examples: [
      [
        'Run the `build` target in all projects of the workspace using the `@bgotink/atelier:glob` builder',
        '$0 run builder @bgotink/atelier:glob --target "build" --include "*"',
      ],
    ],
  });

  builder = Option.String();

  args = Option.Proxy();

  async execute(): Promise<number> {
    if (this.builder == null) {
      const err = new UsageError(`Missing parameter builder`);
      err.clipanion.type = 'usage';
      throw err;
    }

    const {
      allowExtraOptions,
      options: definedOptions,
      description,
    } = await this.getOptionsForBuilder(this.builder);

    let options: JsonObject | undefined;
    if (definedOptions.length === 0) {
      if (allowExtraOptions) {
        options = parseFreeFormArguments(this.args);
      }
    } else {
      const o = parseOptions({
        command: this,
        options: definedOptions,
        description,
        path: [...this.path, this.builder],
        values: this.args,
      });

      if (o === null) {
        return 1;
      }

      options = o;
    }

    return this.runBuilder({
      builder: this.builder,
      options,
    });
  }
}
