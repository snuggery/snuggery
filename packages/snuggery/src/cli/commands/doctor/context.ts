import type {WorkspaceDefinition} from '@snuggery/core';

import type {SnuggeryArchitectHost} from '../../architect/index';
import type {SnuggeryEngineHost} from '../../schematic/engine-host';
import type {SnuggeryWorkflow} from '../../schematic/workflow';
import type {Report} from '../../utils/report';
import type {SchemaRegistry} from '../../utils/schema-registry';

export interface DoctorContext {
	readonly workspace: WorkspaceDefinition;

	readonly report: Report;

	readonly architect: {
		readonly host: SnuggeryArchitectHost;
		readonly registry: SchemaRegistry;
	};

	readonly schematics: {
		readonly workflow: SnuggeryWorkflow;
		readonly engineHost: SnuggeryEngineHost;
		readonly registry: SchemaRegistry;
	};
}
