import {basename, dirname, join} from 'path';

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
}

export async function createTextFileHandle(
	source: WorkspaceHost,
	path: string,
	supportedFilenames?: readonly string[],
): Promise<TextFileHandle | null> {
	if (await source.isFile(path)) {
		return {
			basename: basename(path),
			dirname: dirname(path),
			read: () => source.read(path),
			write: value => source.write(path, value),
			readRelative: (p, sf) =>
				createTextFileHandle(source, join(dirname(path), p), sf),
		};
	} else if (supportedFilenames != null && (await source.isDirectory(path))) {
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

	return null;
}
