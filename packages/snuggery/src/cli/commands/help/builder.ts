import {Option} from "clipanion";

import {ArchitectCommand} from "../../command/architect";
import {formatMarkdownish} from "../../utils/format";
import {printSchema} from "../../utils/print-schema";

export class HelpBuilderCommand extends ArchitectCommand {
	static override readonly paths = [["help", "builder"]];

	static override readonly usage = ArchitectCommand.Usage({
		category: "Workspace information commands",
		description: "Show information about a builder",
		examples: [
			[
				"Print information about `@angular-devkit/build-angular:browser`",
				"$0 help builder @angular-devkit/build-angular:browser",
			],
		],
	});

	builder = Option.String();

	async execute(): Promise<void> {
		const {report, format} = this;
		const {description, packageName, builderName, optionSchema} = await (
			await this.architectHost
		).resolveBuilder(this.builder);

		report.reportInfo(
			formatMarkdownish(
				`Builder \`${builderName}\` of package \`${packageName}\``,
				{format},
			),
		);
		report.reportSeparator();

		if (description) {
			report.reportInfo(formatMarkdownish(description, {format}));
			report.reportSeparator();
		}

		report.reportInfo(`${format.header("Properties:")}\n`);

		if (typeof optionSchema === "boolean") {
			if (optionSchema) {
				report.reportInfo(`This builder accepts all properties.\n`);
			} else {
				report.reportInfo(`This builder doesn't accept any properties.\n`);
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
