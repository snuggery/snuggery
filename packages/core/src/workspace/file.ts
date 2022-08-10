import {createRequire} from 'module';
import {basename, dirname, join} from 'path';

import {InvalidConfigurationError} from './types';

export interface WorkspaceHost {
	isFile(path: string): Promise<boolean>;

	isDirectory(path: string): Promise<boolean>;

	readdir(path: string): Promise<string[]>;

	read(path: string): Promise<string>;

	write(path: string, value: string): Promise<void>;
}

export interface TextFileHandle {
	readonly basename: string;
	readonly dirname: string;

	read(): Promise<string>;

	write(value: string): Promise<void>;

	readRelative(
		path: string,
		supportedFilenames?: string[],
	): Promise<TextFileHandle | null>;

	readDependency(
		path: string,
		supportedFilenames?: string[],
	): Promise<TextFileHandle | null>;
}

export async function createTextFileHandle(
	source: WorkspaceHost,
	path: string,
	supportedFilenames?: readonly string[],
	readonly = false,
): Promise<TextFileHandle | null> {
	if (await source.isDirectory(path)) {
		if (supportedFilenames == null) {
			return null;
		}

		const allFiles = new Set(await source.readdir(path));
		const filename = supportedFilenames.find(name => allFiles.has(name));

		if (filename != null) {
			return await createTextFileHandle(
				source,
				join(path, filename),
				supportedFilenames,
			);
		}
	}

	const read = (await source.isFile(path))
		? () => source.read(path)
		: async () => {
				throw new InvalidConfigurationError(
					`Cannot find configuration at ${path}`,
				);
		  };

	return {
		basename: basename(path),
		dirname: dirname(path),
		read,
		write: !readonly
			? value => source.write(path, value)
			: async () => {
					throw new Error(`File ${path} cannot be modified`);
			  },
		readRelative: (p, sf) =>
			createTextFileHandle(source, join(dirname(path), p), sf, readonly),
		readDependency: (p, sf) =>
			createTextFileHandle(source, createRequire(path).resolve(p), sf, true),
	};
}
