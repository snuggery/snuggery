import type {workspaces} from '@angular-devkit/core';

import type {WorkspaceHost} from './file';
import {nodeFsHost} from './node';
import {createWorkspaceHandle} from './workspace';

export {
	ProjectDefinition,
	ProjectDefinitionCollection,
	TargetDefinition,
	TargetDefinitionCollection,
	WorkspaceDefinition,
	workspaceFilenames,
} from './workspace';

export type {WorkspaceHost as WorkspaceHost};

export async function parseWorkspace(
	path: string,
	{host = nodeFsHost}: {host?: WorkspaceHost} = {},
): Promise<workspaces.WorkspaceDefinition> {
	return await (await createWorkspaceHandle(host, path)).read();
}

export async function writeWorkspace(
	path: string,
	workspace: workspaces.WorkspaceDefinition,
	{host = nodeFsHost}: {host?: WorkspaceHost} = {},
): Promise<void> {
	await (await createWorkspaceHandle(host, path)).write(workspace);
}

export async function updateWorkspace(
	path: string,
	updater: (workspace: workspaces.WorkspaceDefinition) => void | Promise<void>,
	{host = nodeFsHost}: {host?: WorkspaceHost} = {},
): Promise<void> {
	await (await createWorkspaceHandle(host, path)).update(updater);
}
