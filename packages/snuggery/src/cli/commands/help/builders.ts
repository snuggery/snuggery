import {Option} from 'clipanion';

import {ArchitectCommand} from '../../command/architect';
import {formatMarkdownish} from '../../utils/format';

export class HelpBuildersCommand extends ArchitectCommand {
  static paths = [['help', 'builders']];

  static usage = ArchitectCommand.Usage({
    category: 'Workspace information commands',
    description: 'Show information about the builders of a package',
    examples: [
      [
        'List all builders in `@angular-devkit/build-angular`',
        '$0 help builders @angular-devkit/build-angular',
      ],
      [
        'List all builders in the `./tools/builders.json` file',
        '$0 help builders ./tools/builders.json',
      ],
    ],
  });

  packageName = Option.String();

  async execute(): Promise<void> {
    const {report, format} = this;
    const builders = this.architectHost.listBuilders(this.packageName);

    report.reportInfo(
      formatMarkdownish(`Builders in \`${this.packageName}\`:`, {
        format,
        maxLineLength: Infinity,
      }),
    );
    report.reportSeparator();

    for (const {name, description} of builders) {
      report.reportInfo(
        formatMarkdownish(`- \`${this.packageName}:${name}\``, {
          format,
          maxLineLength: Infinity,
        }),
      );

      if (description) {
        report.reportInfo(
          formatMarkdownish(description, {
            format,
            indentation: 2,
          }),
        );
      }

      report.reportSeparator();
    }

    report.reportInfo(
      formatMarkdownish(
        `For more information about a specific builder in \`${this.packageName}\`, run`,
        {format},
      ),
    );
    report.reportInfo(`  $ sn help builder ${this.packageName}:<builder name>`);
    report.reportSeparator();
  }
}
