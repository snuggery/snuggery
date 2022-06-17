import {Option} from 'clipanion';

import {SchematicCommand} from '../command/schematic';

export class NewCommand extends SchematicCommand {
	static override readonly paths = [['new']];

	static override readonly usage = SchematicCommand.Usage({
		category: 'Schematic commands',
		description: 'Create a new workspace',
		examples: [['Create a new workspace ', '$0 new @schematics/angular']],
	});

	dryRun = Option.Boolean('--dry-run', false, {
		description: 'Run the schematics without writing the results to disk',
	});

	force = Option.Boolean('--force', false, {
		description: 'Write the results to disk even if there are conflicts',
	});

	showFileChanges = Option.Boolean('--show-file-changes', false, {
		description: 'Print an overview of all file changes made by the schematic',
	});

	collection = Option.String();

	args = Option.Proxy();

	protected get root(): string {
		return this.context.startCwd;
	}

	protected override readonly resolveSelf = true;

	async execute(): Promise<number | void> {
		const schematic = await this.getSchematic(this.collection, 'ng-new', true);
		const workflow = await this.getWorkflow();

		const {
			options: definedOptions,
			allowExtraOptions,
			description,
		} = await this.getOptions(schematic);

		workflow.registry.addSmartDefaultProvider(
			'ng-cli-version',
			() => require('@angular-devkit/core/package.json').version,
		);
		workflow.registry.addSmartDefaultProvider(
			'snuggery-version',
			() => require('@snuggery/snuggery/package.json').version,
		);

		return this.withOptionValues(
			{
				options: definedOptions,
				allowExtraOptions,
				description,

				pathSuffix: [this.collection],
				values: this.args,
			},
			options =>
				this.runSchematic({
					schematic,
					options: {
						...this.createPathPartialOptions(schematic),
						...options,
					},
				}),
		);
	}
}
