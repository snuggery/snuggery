import type {workspaces} from '@angular-devkit/core';

import type {WorkspaceHost} from './file';
import {nodeFsHost} from './node';
import {
	createWorkspaceHandle,
	ConvertibleWorkspaceDefinition,
	WorkspaceDefinition,
} from './workspace-handle';

export type {WorkspaceHost} from './file';
export {
	type JsonObject,
	type JsonPropertyName,
	type JsonPropertyPath,
	type JsonValue,
	isJsonArray,
	isJsonObject,
	getPrintableType,
} from './types';
export {
	ConvertibleWorkspaceDefinition,
	type ProjectDefinition,
	ProjectDefinitionCollection,
	type TargetDefinition,
	TargetDefinitionCollection,
	type WorkspaceDefinition,
	workspaceFilenames,
} from './workspace-handle';

/**
 * Read the workspace configuration at the given path
 *
 * @param path Path to the workspace file or containing directory
 */
export async function readWorkspace(
	path: string,
	{host = nodeFsHost}: {host?: WorkspaceHost} = {},
): Promise<ConvertibleWorkspaceDefinition> {
	return await (await createWorkspaceHandle(host, path)).read();
}

/**
 * Overwrite the workspace configuration in the given path
 *
 * Note the given path must already contain a workspace configuration file, though it may be empty.
 *
 * @param path Path to the workspace file or containing directory
 */
export async function writeWorkspace(
	path: string,
	workspace: WorkspaceDefinition | workspaces.WorkspaceDefinition,
	{host = nodeFsHost}: {host?: WorkspaceHost} = {},
): Promise<void> {
	await (await createWorkspaceHandle(host, path)).write(workspace);
}

/**
 * Update the workspace configuration in the given path
 *
 * Changes made after the `updater` function returns (or its returned promise resolves) will not
 * be written to the configuration file.
 *
 * @param path Path to the workspace file or containing directory
 * @param updater Function that modifies the configuration
 */
export async function updateWorkspace(
	path: string,
	updater: (workspace: ConvertibleWorkspaceDefinition) => void | Promise<void>,
	{host = nodeFsHost}: {host?: WorkspaceHost} = {},
): Promise<void> {
	await (await createWorkspaceHandle(host, path)).update(updater);
}
