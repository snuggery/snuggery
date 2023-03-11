import {createTextFileHandle, WorkspaceHost} from '../file';
import type {WorkspaceHandle} from '../types';

import {createFileHandle} from './file';
import type {WorkspaceHandleFactory} from './workspace-handle/types';

function loadAngularFactory() {
	return (
		require('./workspace-handle/angular') as typeof import('./workspace-handle/angular')
	).AngularWorkspaceHandle;
}

function loadNxFactory() {
	return (
		require('./workspace-handle/nx') as typeof import('./workspace-handle/nx')
	).NxWorkspaceHandle;
}

const knownTypes = new Map<string, () => WorkspaceHandleFactory>([
	// Extend with own configuration when useful
	['snuggery.json', loadAngularFactory],
	['.snuggery.json', loadAngularFactory],
	['snuggery.yaml', loadAngularFactory],
	['.snuggery.yaml', loadAngularFactory],

	['angular.json', loadAngularFactory],
	['.angular.json', loadAngularFactory],

	['workspace.json', loadNxFactory],
	['.workspace.json', loadNxFactory],
]);

export const workspaceFilenames = Array.from(knownTypes.keys());
export {knownExtensions as workspaceFileExtensions} from './file';

export async function createSplitWorkspaceHandle(
	source: WorkspaceHost,
	path: string,
): Promise<WorkspaceHandle> {
	const fileType = createFileHandle(
		await createTextFileHandle(source, path, workspaceFilenames),
		path,
	);

	const loadFactory = knownTypes.get(fileType.filename);
	if (loadFactory == null) {
		throw new Error(
			`Unexpected filename for configuration: ${fileType.filename}`,
		);
	}

	const Factory = loadFactory();
	return new Factory(fileType);
}
