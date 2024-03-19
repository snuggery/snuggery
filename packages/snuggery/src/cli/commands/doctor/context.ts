import type {WorkspaceDefinition} from "@snuggery/core";

import type {SnuggeryArchitectHost} from "../../architect/index.js";
import type {SnuggeryEngineHost} from "../../schematic/engine-host.js";
import type {SnuggeryWorkflow} from "../../schematic/workflow.js";
import type {Report} from "../../utils/report.js";
import type {SchemaRegistry} from "../../utils/schema-registry.js";

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
