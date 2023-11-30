import {Option} from 'clipanion';

import {
	ArchitectCommand,
	configurationOption,
	addConfigurationsToTarget,
} from '../command/architect';

export class EntryWithProjectCommand extends ArchitectCommand {
	static override readonly paths = [ArchitectCommand.Default];

	static override readonly usage = ArchitectCommand.Usage({
		category: 'Architect commands',
		description: 'Run a target in a project',
		details: `
			Execute a target in the specified project.

			This command allows overriding configured options. To see what options are available for a target, run \`sn <target> <project> --help\`.
		`,
		examples: [
			[
				'Run the `build` target in the `application` project',
				'$0 build application',
			],
			[
				'Run the `build` target with the `production` configuration in the `application` project',
				'$0 build application --configuration production',
			],
			[
				'Run the `build` target in the `application` project with the `production` and `french` configurations',
				'$0 build application --configuration production --configuration french',
			],
			[
				'Run the `build` target in the `application` project with the `production` and `french` configurations',
				'$0 build application --configuration production,french',
			],
			[
				'Run the `serve` target in the `app` project, set `open` to true and set the `baseHref` to `/lorem/`',
				'$0 serve app --open --base-href /lorem/',
			],
			[
				'Show all options to the `test` target in the `app` project that can be passed via command line arguments',
				'$0 test app --help',
			],
		],
	});

	target = Option.String();

	project = Option.String();

	configuration = Option.Array('--configuration,-c', {
		description: 'Configuration(s) to use',
	});

	args = Option.Proxy();

	async execute(): Promise<number> {
		const target = await this.resolveTarget(this.target, this.project);

		return this.withOptionValues(
			{
				...(await this.getOptionsForTarget(target)),
				description: `Run the \`${target.target}\` target in project \`${target.project}\``,
				commandOptions: [configurationOption],
				pathSuffix: [this.target, this.project],
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
