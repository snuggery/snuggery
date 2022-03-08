import {AbstractCommand} from '../../command/abstract-command';
import {formatMarkdownish} from '../../utils/format';
import {defaultMigrationFilename} from '../run/migrations';

export class HelpUpdateCommand extends AbstractCommand {
	static override readonly paths = [['help', 'update']];

	static override readonly usage = AbstractCommand.Usage({
		category: 'Update commands',
		description:
			'Print extensive information on the update process and all steps to take',
	});

	async execute(): Promise<void> {
		this.report.reportInfo(
			formatMarkdownish(
				`
				The update command is split into multiple parts to give full control over the entire process.

				**The process**

				The update process consists of three commands:

				- \`sn run update\` updates packages and adds updated packages with migrations to a \`${defaultMigrationFilename}\` file.
				- \`sn run migrations --prepare\` is an optional step that prunes the \`${defaultMigrationFilename}\` file.
				- \`sn run migrations\` executes the migrations described in the \`${defaultMigrationFilename}\` file.

				**Updating the packages**

				The \`sn run update\` command updates the packages given to it. It does to by giving control to a specific update implementation for the package manager you're using.
				This allows e.g. \`@snuggery/yarn\` to use a yarn plugin which uses yarn's internals to perform the actual changes.

				The command looks at the "ng-update package group" [1] to see what other packages to include in the update.

				Contrary to \`ng update\`, peer dependencies are not automatically updated.
				The \`sn run update\` implementation will run your package manager's installation process as part of its execution.
				It is important to validate the output and ensure that all dependencies are in a valid state before continuing to the migration part of the update process.

				You can easily split this part of the update process into multiple steps, e.g.

				- First update the angular framework using \`sn run update @angular/core@13.0.0 @angular-devkit/build-angular@13.0.0\`
				- Then update Angular Material with \`sn run update @angular/material@13.0.0 @angular/cdk@13.0.0\`
				- ...

				Check the output of the \`sn run update\` command to see if it lists other steps to take.
				For example, if you're using yarn then \`sn run update\` only partially install the updates and leave the final \`yarn install\` to you.

				**Preparing the migrations**

				The \`sn run update\` command executed in the previous step will create a \`${defaultMigrationFilename}\` file if you've updated packages with migrations.
				If there is no \`${defaultMigrationFilename}\` file, the update process ends here.

				Run \`sn run migrations --prepare\` to prepare the \`${defaultMigrationFilename}\` file.
				This performs a couple of actions:

				- It removes packages that don't have any migrations between the versions you updated from and the version you updated to.
				- It adds a comment to the top of the file explaining what the file's contents mean.

				You can now edit the \`${defaultMigrationFilename}\` file to re-order the migrations, skip certain packages or even skip certain migrations in a package.
				To get more information on what migrations would be executed for a certain package, try running \`sn help migrations <package name> --from <previous version>\`.

				**Executing the migrations**

				If you're happy with the content of \`${defaultMigrationFilename}\`, you can execute the migrations listed therein via \`sn run migrations\`.

				This executes the migrations in the file in the order of the packages listed in the file.
				The migrations of every package are sorted by the version the migration belongs to, and alphabetically if multiple migrations are linked to the same version.

				All executed migrations are removed from \`${defaultMigrationFilename}\`, but skipped migrations are left in the file.
				This allows for easily applying the migrations piece by piece rather than all at once.

				If something were to go wrong during the migrations, the \`sn run migrations\` command only removes successful migrations from the \`${defaultMigrationFilename}\` file.
				This means the next execution of \`sn run migrations\` will pick up right where it left off.

				**References**
				`,
				{
					format: this.format,
				},
			),
		);
		this.report.reportSeparator();
		this.report.reportInfo(
			'[1]: https://github.com/angular/angular-cli/blob/0ccc8d3ec7f4371a32945502bb0cf3aa240bcf57/docs/specifications/update.md',
		);
	}
}
