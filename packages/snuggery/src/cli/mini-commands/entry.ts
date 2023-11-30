import {Option} from "clipanion";

import {
	ArchitectCommand,
	configurationOption,
	addConfigurationsToTarget,
} from "../command/architect";

export class EntryCommand extends ArchitectCommand {
	static override readonly paths = [ArchitectCommand.Default];

	static override readonly usage = ArchitectCommand.Usage({
		description: "Run a target",
		details: `
			Execute a target.

			This command allows overriding configured options. To see what options are available for a target, add \`--help\`.
		`,
		examples: [
			["Run the `build` target", "$0 build"],
			[
				"Run the `build` target with the `production` configuration",
				"$0 build --configuration production",
			],
			[
				"Run the `build` target with the `production` and `french` configurations",
				"$0 build --configuration production --configuration french",
			],
			[
				"Run the `build` target with the `production` and `french` configurations",
				"$0 build --configuration production,french",
			],
			[
				"Run the `serve` target, set `open` to true and set the `baseHref` to `/lorem/`",
				"$0 serve --open --base-href /lorem/",
			],
			[
				"Show all options to the `test` target that can be passed via command line arguments",
				"$0 test --help",
			],
		],
	});

	target = Option.String();

	configuration = Option.Array("--configuration,-c", {
		description: "Configuration(s) to use",
	});

	args = Option.Proxy();

	async execute(): Promise<number> {
		const target = await this.resolveTarget(this.target, "project");

		return this.withOptionValues(
			{
				...(await this.getOptionsForTarget(target)),
				description: `Run \`${target.target}\``,
				commandOptions: [configurationOption],
				pathSuffix: [this.target],
				values: this.args,
			},
			(options) => {
				return this.runTarget({
					target: addConfigurationsToTarget(
						target,
						options,
						this.getConfigurations(),
					),
					options,
				});
			},
		);
	}
}
