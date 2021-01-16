import {Option} from 'clipanion';

import {AbstractCommand} from '../command/abstract-command';

export class GenerateCommand extends AbstractCommand {
  static paths = [['generate']];

  static usage = AbstractCommand.Usage({
    category: 'Schematic commands',
    description: 'Alias for `ai run schematic`',
    examples: [
      [
        'Run the `component` schematic of the `@schematics/angular` package',
        '$0 generate @schematics/angular:component',
      ],
      [
        "Dry-run the `application` schematic of the default schematic package (if not configured, that's `@schematics/angular`)",
        '$0 generate --dry-run application',
      ],
    ],
  });

  args = Option.Proxy();

  async execute(): Promise<number | void> {
    return this.cli.run(['run', 'schematic', ...this.args]);
  }
}
