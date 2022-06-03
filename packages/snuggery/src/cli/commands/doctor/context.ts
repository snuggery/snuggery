import type {schema} from '@angular-devkit/core';
import type {WorkspaceDefinition} from '@snuggery/core';

import type {SnuggeryArchitectHost} from '../../architect/index';
import type {SnuggeryWorkflow} from '../../schematic/workflow';
import type {Report} from '../../utils/report';

export interface DoctorContext {
	readonly workspace: WorkspaceDefinition;

	readonly report: Report;

	readonly architect: {
		readonly host: SnuggeryArchitectHost;
		readonly registry: schema.CoreSchemaRegistry;
	};

	readonly schematics: SnuggeryWorkflow;
}
