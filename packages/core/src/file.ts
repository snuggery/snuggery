import {extname, join} from 'path';

import {JsonFileHandle} from './file/json';
import type {WorkspaceHost, FileHandle, FileHandleFactory} from './file/types';

export type {FileHandle, WorkspaceHost};

const knownHandleTypes = new Map<string, FileHandleFactory>([
	['.json', JsonFileHandle],
]);

export async function createFileHandle(
	source: WorkspaceHost,
	path: string,
	supportedFilenames: readonly string[],
): Promise<FileHandle> {
	if (await source.isFile(path)) {
		const Factory = knownHandleTypes.get(extname(path));

		if (Factory != null) {
			return new Factory(source, path);
		}
	} else if (await source.isDirectory(path)) {
		const allFiles = new Set(await source.readdir(path));
		const filename = supportedFilenames.find(name => allFiles.has(name));

		if (filename != null) {
			return await createFileHandle(
				source,
				join(path, filename),
				supportedFilenames,
			);
		}
	}

	throw new Error(`Cannot find configuration at ${path}`);
}
