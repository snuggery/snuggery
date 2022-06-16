import {Option} from 'clipanion';

import {SchematicCommand} from '../../command/schematic';
import type {SnuggeryCollection} from '../../schematic/engine-host';
import {formatMarkdownish} from '../../utils/format';

export class HelpSchematicsCommand extends SchematicCommand {
	static override readonly paths = [['help', 'schematics']];

	static override readonly usage = SchematicCommand.Usage({
		category: 'Workspace information commands',
		description: 'Show information about schematic collection',
		examples: [
			[
				'Print information about `@schematics/angular`',
				'$0 help schematics @schematics/angular',
			],
			[
				"Print information about the configured collection(s) (if unconfigured, that's `@schematics/angular` if installed)",
				'$0 help schematics',
			],
		],
	});

	collectionName = Option.String({required: false});

	protected readonly dryRun = false; // abstract in SchematicCommand, of no use here
	protected readonly force = false; // abstract in SchematicCommand, of no use here
	protected readonly showFileChanges = false; // abstract in SchematicCommand, of no use here

	protected get root(): string {
		return this.workspace.workspaceDir;
	}

	async execute(): Promise<void> {
		const {report, format} = this;
		if (this.collectionName) {
			const collection = await this.getCollection(this.collectionName);

			this.#showCollection(collection);
		} else {
			const configuredCollections = await this.getConfiguredCollections();
			const defaultCollection = await this.getDefaultCollection();
			if (configuredCollections != null) {
				const shownShorthands = new Map<string, string>();

				for (const collection of configuredCollections) {
					this.#showCollection(collection, shownShorthands);
				}
			} else if (defaultCollection != null) {
				this.#showCollection(defaultCollection, new Map());

				report.reportWarning(
					'This project is using the deprecated `defaultCollection` configuration, consider switching to `schematicCollections` instead',
				);
				report.reportSeparator();
			} else {
				report.reportInfo('No schematic collections have been configured.');
				report.reportInfo('Pass a collection name into this command');
				report.reportInfo(`  $ sn help schematics <collection name>`);
				report.reportInfo(
					formatMarkdownish(
						`or configure \`schematicCollections\` in the workspace or project`,
						{format},
					),
				);
				return;
			}

			report.reportInfo(
				formatMarkdownish(
					`For more information about a specific schematic, run`,
					{format},
				),
			);
			report.reportInfo(`  $ sn help schematic <schematic name>`);
		}

		report.reportSeparator();
	}

	#showCollection(
		collection: SnuggeryCollection,
		shownShorthands?: Map<string, string>,
	): void {
		const {report, format} = this;
		const collectionName = collection.description.name;

		const prefix = shownShorthands ? '' : `${collectionName}:`;

		report.reportInfo(
			formatMarkdownish(`Collection \`${collectionName}\`:`, {
				format,
				maxLineLength: Infinity,
			}),
		);
		report.reportSeparator();

		for (const schematicName of collection.listSchematicNames()) {
			if (!shownShorthands?.has(schematicName)) {
				report.reportInfo(
					formatMarkdownish(`- \`${prefix}${schematicName}\``, {
						format,
						maxLineLength: Infinity,
					}),
				);

				shownShorthands?.set(schematicName, collectionName);
			} else {
				report.reportInfo(
					formatMarkdownish(`- \`${collectionName}:${schematicName}\``, {
						format,
						maxLineLength: Infinity,
					}),
				);

				report.reportInfo(
					formatMarkdownish(
						`The collection name must be passed, as \`${schematicName}\` maps onto \`${shownShorthands.get(
							schematicName,
						)}:${schematicName}\``,
						{
							format,
							maxLineLength: Infinity,
							indentation: 2,
						},
					),
				);
			}

			try {
				const {description} = collection.createSchematic(
					schematicName,
					false,
				).description;

				if (description) {
					report.reportInfo(
						formatMarkdownish(description, {
							format,
							indentation: 2,
						}),
					);
				}
			} catch (e) {
				let error;
				if (e instanceof Error) {
					error = this.prettifyError(e);
				} else {
					error = new Error(String(typeof e === 'symbol' ? e.toString() : e));
				}

				report.reportError(
					formatMarkdownish(error.message, {
						format,
						maxLineLength: Infinity,
						indentation: 2,
					}),
				);
			}

			report.reportSeparator();
		}
	}
}
