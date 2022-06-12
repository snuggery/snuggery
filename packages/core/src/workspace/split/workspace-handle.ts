import type {WorkspaceHost} from '../file';
import type {WorkspaceHandle} from '../types';

import {createFileHandle} from './file';
import {AngularWorkspaceHandle} from './workspace-handle/angular';
import {NxWorkspaceHandle} from './workspace-handle/nx';
import type {WorkspaceHandleFactory} from './workspace-handle/types';

const knownTypes = new Map<string, WorkspaceHandleFactory>([
	// Extend with own configuration when useful
	['snuggery.json', AngularWorkspaceHandle],
	['.snuggery.json', AngularWorkspaceHandle],
	['snuggery.yaml', AngularWorkspaceHandle],
	['.snuggery.yaml', AngularWorkspaceHandle],

	['angular.json', AngularWorkspaceHandle],
	['.angular.json', AngularWorkspaceHandle],

	['workspace.json', NxWorkspaceHandle],
	['.workspace.json', NxWorkspaceHandle],
]);

export const workspaceFilenames = Array.from(knownTypes.keys());

export async function createSplitWorkspaceHandle(
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
