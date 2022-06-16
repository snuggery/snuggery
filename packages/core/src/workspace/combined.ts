import type {CombinedWorkspaceHandleFactory} from './combined/types';
import {createTextFileHandle, WorkspaceHost} from './file';
import type {WorkspaceHandle} from './types';

function loadWorkspaceHandleFactory() {
	return (require('./combined/kdl') as typeof import('./combined/kdl'))
		.SnuggeryKdlWorkspaceHandle;
}

const knownTypes = new Map<string, () => CombinedWorkspaceHandleFactory>([
	// Extend with own configuration when useful
	['snuggery.kdl', loadWorkspaceHandleFactory],
	['.snuggery.kdl', loadWorkspaceHandleFactory],
]);

export const workspaceFilenames = Array.from(knownTypes.keys());

export async function createCombinedWorkspaceHandle(
	source: WorkspaceHost,
	path: string,
): Promise<WorkspaceHandle | null> {
	const fileHandle = await createTextFileHandle(
		source,
		path,
		workspaceFilenames,
	);
	if (fileHandle == null) {
		return null;
	}

	const loadFactory = knownTypes.get(fileHandle.basename);
	if (loadFactory == null) {
		return null;
	}

	const Factory = loadFactory();
	return new Factory(fileHandle);
}
