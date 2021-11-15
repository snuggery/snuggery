import {createFileHandle, WorkspaceHost} from './file';
import {AngularWorkspaceHandle} from './workspace/angular';
import {NxWorkspaceHandle} from './workspace/nx';
import type {WorkspaceHandle, WorkspaceHandleFactory} from './workspace/types';

export {
	ProjectDefinition,
	ProjectDefinitionCollection,
	TargetDefinition,
	TargetDefinitionCollection,
	WorkspaceDefinition,
	WorkspaceHandle,
} from './workspace/types';

const knownTypes = new Map<string, WorkspaceHandleFactory>([
	// Extend with own configuration when useful
	['snuggery.json', AngularWorkspaceHandle],
	['.snuggery.json', AngularWorkspaceHandle],

	['angular.json', AngularWorkspaceHandle],
	['.angular.json', AngularWorkspaceHandle],

	['workspace.json', NxWorkspaceHandle],
	['.workspace.json', NxWorkspaceHandle],
]);

export const workspaceFilenames = Array.from(knownTypes.keys());

export async function createWorkspaceHandle(
	source: WorkspaceHost,
	path: string,
): Promise<WorkspaceHandle> {
	const fileType = await createFileHandle(source, path, workspaceFilenames);
	const Factory = knownTypes.get(fileType.filename);

	if (Factory == null) {
		throw new Error(
			`Unexpected filename for configuration: ${fileType.filename}`,
		);
	}

	return new Factory(fileType);
}
