import type {BuilderContext} from '@angular-devkit/architect';
import type {workspaces} from '@angular-devkit/core';
import {
	type ExtraConfigurationDefinition,
	type ExtraConfigurationDefinitionWithType,
	type JsonValue,
	extractExtraConfiguration as _extractExtraConfiguration,
	type WorkspaceDefinition,
} from '@snuggery/core';

import {findWorkspace} from './workspace';

export type {
	ExtraConfigurationDefinition,
	ExtraConfigurationDefinitionWithType,
};

/**
 * Extract non-standard configuration from the workspace definition
 *
 * Configuration can be validated by passing in a `test` function in the
 * definition.
 *
 * This functionality allows creating leveled configuration in your workspace
 * configuration file. This allows users to define configuration on workspace
 * level, instead of being forced to configure every project separately.
 *
 * @param definition Definition for the configuration value
 * @param context Builder context
 * @param workspace The workspace from which to extract the configuration, if none is passed the current configuration is looked up
 */
export function extractExtraConfiguration<
	T extends ExtraConfigurationDefinition &
		Partial<ExtraConfigurationDefinitionWithType<JsonValue>>,
>(
	definition: T,
	context: BuilderContext,
	workspace?: WorkspaceDefinition | workspaces.WorkspaceDefinition,
): T extends ExtraConfigurationDefinitionWithType<infer U>
	? Promise<U[]>
	: Promise<JsonValue[]>;
export async function extractExtraConfiguration(
	configurationDefinition: ExtraConfigurationDefinition,
	context: BuilderContext,
	workspace?: WorkspaceDefinition | workspaces.WorkspaceDefinition,
): Promise<JsonValue[]> {
	workspace ??= await findWorkspace(context);

	// Angular CLI tends to pass a non-empty target with empty project in certain cases...
	if (context.target?.project) {
		return _extractExtraConfiguration(
			configurationDefinition,
			workspace,
			context.target.project,
			context.target.target,
		);
	}

	return _extractExtraConfiguration(configurationDefinition, workspace);
}
