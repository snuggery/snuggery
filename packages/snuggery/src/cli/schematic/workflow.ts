import {normalize, schema, virtualFs} from '@angular-devkit/core';
import {NodeJsSyncHost} from '@angular-devkit/core/node';
import {Engine, workflow} from '@angular-devkit/schematics';

import type {
	SnuggeryCollectionDescription,
	SnuggeryEngineHost,
	SnuggerySchematicDescription,
} from './engine-host';

/**
 * A workflow specifically for Node tools.
 */
export class SnuggeryWorkflow extends workflow.BaseWorkflow {
	constructor(
		_root: string,
		{
			engineHost,
			force,
			dryRun,
			registry,
		}: {
			force: boolean;
			dryRun: boolean;
			registry: schema.CoreSchemaRegistry;
			engineHost: SnuggeryEngineHost;
		},
	) {
		const root = normalize(_root);
		const host = new virtualFs.ScopedHost(new NodeJsSyncHost(), root);

		super({
			host,
			engineHost,

			force,
			dryRun,
			registry,
		});
	}

	override get engine(): Engine<
		SnuggeryCollectionDescription,
		SnuggerySchematicDescription
	> {
		return this._engine as Engine<
			SnuggeryCollectionDescription,
			SnuggerySchematicDescription
		>;
	}

	override get engineHost(): SnuggeryEngineHost {
		return this._engineHost as SnuggeryEngineHost;
	}
}
