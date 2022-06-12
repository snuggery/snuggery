import {SnuggeryKdlWorkspaceHandle} from './combined/kdl';
import type {CombinedWorkspaceHandleFactory} from './combined/types';
import {createTextFileHandle, WorkspaceHost} from './file';
import type {WorkspaceHandle} from './types';

const knownTypes = new Map<string, CombinedWorkspaceHandleFactory>([
	// Extend with own configuration when useful
	['snuggery.kdl', SnuggeryKdlWorkspaceHandle],
	['.snuggery.kdl', SnuggeryKdlWorkspaceHandle],
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

	const Factory = knownTypes.get(fileHandle.basename);
	if (Factory == null) {
		return null;
	}

	return new Factory(fileHandle);
}
