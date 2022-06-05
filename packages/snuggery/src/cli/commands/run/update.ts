import {Option, UsageError} from 'clipanion';

import {ArchitectCommand} from '../../command/architect';

export class RunUpdateCommand extends ArchitectCommand {
	static override readonly paths = [['run', 'update']];

	static override readonly usage = ArchitectCommand.Usage({
		category: 'Update commands',
		description: 'Update packages and prepare migrations',
		details: `
			This command shells out to an implementation specific to your package manager. Ensure that
			the relevant \`@snuggery\` package is installed, e.g. \`@snuggery/yarn\` if you're using yarn 3.
		`,
		examples: [
			[
				'Update `@angular/core` and related packages to 12.2.2 and update `@angular/cli` and related packages to a version matching ^12.2.0',
				'$0 run update @angular/core@12.2.2 @angular/cli@^12.2.0',
			],
		],
	});

	/**
	 * Define the `help` option explicitly
	 *
	 * Clipanion by default logs a help statement if `<path> --help` or `<path> -h` is executed, but
	 * it no longer does this when other parameters are present, e.g.
	 *
	 * ```bash
	 * sn run migration --help # prints statement
	 * sn run migration @angular/cli --help # prints error about unknown option --help
	 * ```
	 *
	 * Most of our commands don't need this, because they proxy extra arguments into `parseOptions`,
	 * which handles the `--help` properly. This migration command doesn't, so we have to provide the
	 * functionality to ensure we don't confuse our users by having some commands allow adding
	 * `--help` when arguments are present and some commands throwing errors if arguments are present
	 * and `--help` is passed.
	 */
	override help = Option.Boolean('--help,-h', false, {hidden: true});

	packages = Option.Rest({name: 'package@version'});

	async execute(): Promise<number> {
		// Always make this command run as if it was executed in the workspace root
		this.context.startCwd = this.workspace.basePath;

		const pmPackage = `@snuggery/${this.packageManager}`;
		const builderSpec = `${pmPackage}:update`;

		try {
			await (await this.architectHost).resolveBuilder(builderSpec);
		} catch {
			throw new UsageError(
				`Failed to find ${pmPackage} to perform the actual update`,
			);
		}

		return this.runBuilder({
			builder: builderSpec,
			options: {packages: this.packages},
		});
	}
}
