import {createFileHandle, WorkspaceHost} from './file';
import {AngularWorkspaceHandle} from './workspace/angular';
import {NxWorkspaceHandle} from './workspace/nx';
import type {WorkspaceHandle, WorkspaceHandleFactory} from './workspace/types';

export {
	ConvertibleWorkspaceDefinition,
	ProjectDefinition,
	ProjectDefinitionCollection,
	TargetDefinition,
	TargetDefinitionCollection,
	WorkspaceDefinition,
	WorkspaceHandle,
} from './workspace/types';

const knownTypes = new Map<string, WorkspaceHandleFactory>(
	(
		[
			// Extend with own configuration when useful
			['snuggery', AngularWorkspaceHandle],
			['angular', AngularWorkspaceHandle],
			['workspace', NxWorkspaceHandle],
		] as [string, WorkspaceHandleFactory][]
	).flatMap(([basename, HandleFactory]) => [
		[`${basename}.json`, HandleFactory],
		[`${basename}.yaml`, HandleFactory],
		[`.${basename}.json`, HandleFactory],
		[`.${basename}.yaml`, HandleFactory],
	]),
);

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
