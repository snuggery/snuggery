import {extname} from 'path';

import type {TextFileHandle} from '../file';

import {JsonFileHandle} from './file/json';
import type {FileHandle, FileHandleFactory} from './file/types';
import {YamlFileHandle} from './file/yaml';

export type {FileHandle};

const knownHandleTypes = new Map<string, FileHandleFactory>([
	['.json', JsonFileHandle],
	['.yaml', YamlFileHandle],
]);

export function createFileHandle(
	source: TextFileHandle | null,
	path: string,
	context: {updateReady?: Promise<void>} = {},
): FileHandle {
	if (source == null) {
		throw new Error(`Cannot find configuration at ${path}`);
	}

	const Factory = knownHandleTypes.get(extname(source.basename));
	if (Factory == null) {
		throw new Error(`Cannot find configuration at ${path}`);
	}

	return new Factory({
		source,
		get updateReady() {
			return context.updateReady;
		},
		set updateReady(updateReady) {
			context.updateReady = updateReady;
		},
		openRelative: async (path, supportedFilenames) =>
			createFileHandle(
				await source.openRelative(path, supportedFilenames),
				path,
				context,
			),
		openDependency: async (path, supportedFilenames) =>
			createFileHandle(
				await source.openDependency(path, supportedFilenames),
				path,
				context,
			),
	});
}
