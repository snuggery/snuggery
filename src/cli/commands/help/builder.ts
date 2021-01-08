import {ArchitectCommand} from '../../command/architect';
import {formatMarkdownish} from '../../utils/format';
import {printSchema} from '../../utils/print-schema';

export class HelpBuilderCommand extends ArchitectCommand {
  @ArchitectCommand.String()
  builder!: string;

  @ArchitectCommand.Path('help', 'builder')
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

    report.reportInfo(`${format.bold('Options:')}\n`);

    if (optionSchema === true) {
      report.reportInfo(`This builder accepts all options.\n`);
      return;
    }
    if (optionSchema === false) {
      report.reportInfo(`This builder doens't accept any options.\n`);
      return;
    }

    printSchema(await this.registry.flatten(optionSchema).toPromise(), {
      report,
      format,
      supportPathFormat: false,
    });
  }
}
