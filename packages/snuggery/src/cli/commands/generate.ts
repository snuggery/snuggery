import {Option} from "clipanion";

import {AbstractCommand} from "../command/abstract-command.js";

export class GenerateCommand extends AbstractCommand {
	static override readonly paths = [["generate"]];

	static override readonly usage = AbstractCommand.Usage({
		category: "Schematic commands",
		description: "Alias for `sn run schematic`",
		details: `
			A schematic is a code generator that supports complex logic. It contains instructions and templates for creating or modifying your codebase.

			Schematics are published as npm packages called collections. A schematic is reference uniquely by defining both the collection's name and the schematic's name: \`<collection>:<schematic>\`, e.g. \`@schematics/angular:component\`. A workspace has a default collection, those schematics can be referenced simply by their name. If no default collection is configured, \`@schematics/angular\` is the default collection.

			This command accepts options and schematics usually also support options. The order in which your provide these options is important. The options of the Snuggery command (\`--dry-run\`, \`--force\` and \`--show-file-changes\`) must come before the name of the schematic. Any option passed after the schematic's identifier are considered options for the schematic itself.

			To get a list of available options for a schematic, run \`sn generate <schematic> --help\`.
		`,
		examples: [
			[
				"Run the `component` schematic of the `@schematics/angular` package",
				"$0 generate @schematics/angular:component",
			],
			[
				"Dry-run the `application` schematic of the default schematic package (if not configured, that's `@schematics/angular`)",
				"$0 generate --dry-run application",
			],
		],
	});

	args = Option.Proxy();

	async execute(): Promise<number | void> {
		return this.cli.run(["run", "schematic", ...this.args]);
	}
}
