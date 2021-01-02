import {AbstractCommand} from '../command/abstract-command';

export class HelpCommand extends AbstractCommand {
  @AbstractCommand.Path()
  @AbstractCommand.Path('-h')
  @AbstractCommand.Path('--help')
  @AbstractCommand.Path('help')
  async execute() {
    this.context.stdout.write(this.cli.usage(null));

    return 0;
  }
}
