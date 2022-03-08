import {Option} from 'clipanion';

import {
	addConfigurationsToTarget,
	ArchitectCommand,
	configurationOption,
} from '../command/architect';

export class EntryCommand extends ArchitectCommand {
	static override readonly paths = [ArchitectCommand.Default];

	static override readonly usage = ArchitectCommand.Usage({
		category: 'Architect commands',
		description: 'Run a target in the current project',
		details: `
			Execute a target without specifying a project. Snuggery looks for the project to run the target in:

			- If the command is executed from within a project that has the requested target, the target is executed in that project.
			- If the workspace has a default project and that project has the requested target, the target is executed in the default project.
			- If there's only one project in the entire workspace that has the requested target, the target is executed in that project.

			A list of all targets you can run without specifying the project is shown when you run \`sn help targets\`.

			This command allows overriding configured options. To see what options are available for a target, run \`sn <target> --help\`.
		`,
		examples: [
			['Run the `build` target', '$0 build'],
			[
				'Run the `build` target with the `production` configuration',
				'$0 build --configuration production',
			],
			[
				'Run the `build` target with the `production` and `french` configurations',
				'$0 build --configuration production --configuration french',
			],
			[
				'Run the `build` target with the `production` and `french` configurations',
				'$0 build --configuration production,french',
			],
			[
				'Run the `serve` target, set `open` to true and set the `baseHref` to `/lorem/`',
				'$0 serve --open --base-href /lorem/',
			],
			[
				'Show all options to the `test` target that can be passed via command line arguments',
				'$0 test --help',
			],
		],
	});

	target = Option.String();

	configuration = Option.Array('--configuration,-c', {
		description: 'Configuration(s) to use',
	});

	args = Option.Proxy();

	async execute(): Promise<number> {
		const target = this.resolveTarget(this.target, null);

		return this.withOptionValues(
			{
				...(await this.getOptionsForTarget(target)),
				description: `Run the \`${target.target}\` target in project \`${target.project}\``,
				commandOptions: [configurationOption],
				pathSuffix: [this.target],
				values: this.args,
			},
			options => {
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
