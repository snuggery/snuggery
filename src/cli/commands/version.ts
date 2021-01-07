/* eslint-disable @typescript-eslint/no-var-requires */

import {AbstractCommand} from '../command/abstract-command';

export class VersionCommand extends AbstractCommand {
  static usage = AbstractCommand.Usage({
    description: `Print version information`,
  });

  @AbstractCommand.Path('--version')
  async execute(): Promise<number> {
    this.context.report.reportInfo(
      `Atelier version ${require('@bgotink/atelier/package.json').version}`,
    );
    this.context.report.reportInfo(
      `Angular DevKit version ${
        require('@angular-devkit/core/package.json').version
      }`,
    );

    return 0;
  }
}
