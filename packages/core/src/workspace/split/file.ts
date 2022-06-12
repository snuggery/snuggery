import {extname, join} from 'path';

import {createTextFileHandle, WorkspaceHost} from '../file';

import {JsonFileHandle} from './file/json';
import type {FileHandle, FileHandleFactory} from './file/types';
import {YamlFileHandle} from './file/yaml';

export type {FileHandle};

const knownHandleTypes = new Map<string, FileHandleFactory>([
	['.json', JsonFileHandle],
	['.yaml', YamlFileHandle],
]);

export async function createFileHandle(
	source: WorkspaceHost,
	path: string,
	supportedFilenames?: readonly string[],
	context: {updateReady?: Promise<void>} = {},
): Promise<FileHandle> {
	const textHandle = await createTextFileHandle(
		source,
		path,
		supportedFilenames,
	);
	if (textHandle != null) {
		const Factory = knownHandleTypes.get(extname(textHandle.basename));
		if (Factory != null) {
			return new Factory({
				source: textHandle,
				get updateReady() {
					return context.updateReady;
				},
				set updateReady(updateReady) {
					context.updateReady = updateReady;
				},
				createFileHandle: (path, supportedFilenames) =>
					createFileHandle(
						source,
						join(textHandle.dirname, path),
						supportedFilenames,
						context,
					),
			});
		}
	}

	throw new Error(`Cannot find configuration at ${path}`);
}
