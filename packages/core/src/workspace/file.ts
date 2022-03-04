import {extname, join} from 'path';

import {JsonFileHandle} from './file/json';
import type {WorkspaceHost, FileHandle, FileHandleFactory} from './file/types';
import {YamlFileHandle} from './file/yaml';

export type {FileHandle, WorkspaceHost};

const knownHandleTypes = new Map<string, FileHandleFactory>([
	['.json', JsonFileHandle],
	['.yaml', YamlFileHandle],
]);

export async function createFileHandle(
	source: WorkspaceHost,
	path: string,
	supportedFilenames?: readonly string[],
): Promise<FileHandle> {
	if (await source.isFile(path)) {
		const Factory = knownHandleTypes.get(extname(path));

		if (Factory != null) {
			return new Factory(
				{
					source,
					createFileHandle: (p, sf) => createFileHandle(source, p, sf),
				},
				path,
			);
		}
	} else if (supportedFilenames != null && (await source.isDirectory(path))) {
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
