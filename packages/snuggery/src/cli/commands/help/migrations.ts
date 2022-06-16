import {Option, UsageError} from 'clipanion';
import * as t from 'typanion';

import {MigrationCommand} from '../../command/migration';
import {formatMarkdownish} from '../../utils/format';
import {isSemVer} from '../../utils/typanion';

export class HelpMigrationsCommand extends MigrationCommand {
	static override readonly paths = [['help', 'migrations']];

	static override readonly schema = [
		t.hasKeyRelationship('to', t.KeyRelationship.Requires, ['from'], {
			ignore: ['', undefined],
		}),
	];

	static override readonly usage = MigrationCommand.Usage({
		category: 'Workspace information commands',
		description: 'Show information about migrations for a package',
		examples: [
			[
				'Print information about the migrations in `@schematics/angular`',
				'$0 help migrations @schematics/angular',
			],
			[
				'Print information about the migrations in `@schematics/angular` from 9.0.0 up to the installed version',
				'$0 help migrations @schematics/angular --from 9.0.0',
			],
		],
	});

	from = Option.String('--from', {
		description: 'The version from which to start listing migrations',
		validator: isSemVer(),
	});

	to = Option.String('--to', {
		description:
			'The highest version to include in the listed migrations, can only be set if `--from` is set',
		validator: isSemVer(),
	});

	package = Option.String();

	protected readonly dryRun = false; // abstract in SchematicCommand, of no use here
	protected readonly force = false; // abstract in SchematicCommand, of no use here
	protected readonly showFileChanges = false; // abstract in SchematicCommand, of no use here

	protected override get root(): string {
		return this.workspace.workspaceFolder;
	}

	async execute(): Promise<void> {
		const {report, format} = this;

		const collection = await this.getMigrationCollection(this.package);

		if (collection == null) {
			report.reportInfo(
				formatMarkdownish(
					`Package \`${this.package}\` doesn't have any migrations.`,
					{format},
				),
			);
			return;
		}

		const currentVersion = collection.version ?? collection.description.version;

		let schematics;
		if (this.from) {
			const toVersion = this.to?.format() ?? currentVersion;

			if (toVersion == null) {
				throw new UsageError(
					`Package ${JSON.stringify(
						this.package,
					)} doesn't define a version, specify the current version via --to`,
				);
			}

			const {default: gt} = await import('semver/functions/gt.js');
			if (currentVersion != null && gt(toVersion, currentVersion)) {
				// Angular has the tendency to declare migrations on the stable version even if
				// the migrations should run on pre-releases as well, so running migrations on
				// pre-release versions
				const {default: diff} = await import('semver/functions/diff.js');
				if (!diff(toVersion, currentVersion)?.startsWith('pre')) {
					throw new UsageError(
						`Limit ${toVersion} is higher than the installed version ${currentVersion}`,
					);
				}
			}

			schematics = await this.getMigrationsInRange(
				collection,
				this.from.format(),
				toVersion,
			);

			report.reportInfo(
				formatMarkdownish(
					`Migrations for \`${
						this.package
					}\` between \`${this.from.format()}\` and \`${toVersion}:\``,
					{
						format,
						maxLineLength: Infinity,
					},
				),
			);
		} else {
			schematics = collection.listSchematicNames().map(name => {
				try {
					const schematic = collection.createSchematic(name, false);

					return {schematic, version: schematic.description.version};
				} catch (e) {
					let error;
					if (e instanceof Error) {
						error = this.prettifyError(e);
					} else {
						error = new Error(String(typeof e === 'symbol' ? e.toString() : e));
					}

					return {name, error};
				}
			});

			report.reportInfo(
				formatMarkdownish(
					`Migrations for \`${this.package}\` (${
						currentVersion
							? `currently at \`${currentVersion}\``
							: 'version number not found'
					}):`,
					{
						format,
						maxLineLength: Infinity,
					},
				),
			);
		}

		report.reportSeparator();

		for (const schematic of schematics) {
			if ('error' in schematic && schematic.error != null) {
				report.reportInfo(
					formatMarkdownish(`- \`${schematic.name}\``, {
						format,
						maxLineLength: Infinity,
					}),
				);
				report.reportError(
					formatMarkdownish(schematic.error.message, {
						format,
						maxLineLength: Infinity,
						indentation: 2,
					}),
				);
			} else {
				report.reportInfo(
					formatMarkdownish(`- \`${schematic.schematic.description.name}\``, {
						format,
						maxLineLength: Infinity,
					}),
				);
				report.reportInfo(
					formatMarkdownish(
						schematic.version
							? `Version \`${schematic.version}\``
							: 'Not linked to a version',
						{
							format,
							maxLineLength: Infinity,
							indentation: 2,
						},
					),
				);
			}

			report.reportSeparator();
		}
	}
}
