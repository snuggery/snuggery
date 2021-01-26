import {Option, UsageError} from 'clipanion';

import {ArchitectCommand} from '../../command/architect';

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

    return this.withOptionValues(
      {
        ...(await this.getOptionsForBuilder(this.builder)),
        values: this.args,
      },
      options => this.runBuilder({builder: this.builder, options}),
    );
  }
}
