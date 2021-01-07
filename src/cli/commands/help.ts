import {AbstractCommand} from '../command/abstract-command';

export class HelpCommand extends AbstractCommand {
  @AbstractCommand.Path()
  @AbstractCommand.Path('-h')
  @AbstractCommand.Path('--help')
  @AbstractCommand.Path('help')
  async execute(): Promise<number> {
    this.context.report.reportInfo(this.cli.usage(null));

    return 0;
  }
}