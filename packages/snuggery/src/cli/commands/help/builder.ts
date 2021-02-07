import {Option} from 'clipanion';

import {ArchitectCommand} from '../../command/architect';
import {formatMarkdownish} from '../../utils/format';
import {printSchema} from '../../utils/print-schema';

export class HelpBuilderCommand extends ArchitectCommand {
  static paths = [['help', 'builder']];

  static usage = ArchitectCommand.Usage({
    category: 'Workspace information commands',
    description: 'Show information about a builder',
    examples: [
      [
        'Print information about `@angular-devkit/build-angular:browser`',
        '$0 help builder @angular-devkit/build-angular:browser',
      ],
    ],
  });

  builder = Option.String();

  async execute(): Promise<void> {
    const {report, format} = this;
    const {
      description,
      packageName,
      builderName,
      optionSchema,
    } = await this.architectHost.resolveBuilder(this.builder);

    report.reportInfo(
      formatMarkdownish(
        `Builder \`${builderName}\` of package \`${packageName}\``,
        {format, paragraphs: false},
      ),
    );
    report.reportSeparator();

    if (description) {
      report.reportInfo(
        formatMarkdownish(description, {format, paragraphs: true}),
      );
      report.reportSeparator();
    }

    report.reportInfo(`${format.bold('Properties:')}\n`);

    if (typeof optionSchema === 'boolean') {
      if (optionSchema) {
        report.reportInfo(`This builder accepts all properties.\n`);
      } else {
        report.reportInfo(`This builder doens't accept any properties.\n`);
      }
      return;
    }

    printSchema(optionSchema, {
      report,
      format,
      supportPathFormat: false,
    });
  }
}
