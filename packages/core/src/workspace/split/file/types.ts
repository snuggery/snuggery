import type {TextFileHandle} from '../../file';
import type {JsonObject} from '../../types';

export interface FileHandle {
	readonly filename: string;

	read(): Promise<JsonObject>;

	write(
		value: JsonObject,
		options: {header?: string | string[]},
	): Promise<void>;

	update(updater: (value: JsonObject) => void | Promise<void>): Promise<void>;

	openRelative(
		path: string,
		supportedFilenames?: string[],
	): Promise<FileHandle>;

	openDependency(
		path: string,
		supportedFilenames?: string[],
	): Promise<FileHandle>;
}

export interface FileHandleContext<T extends FileHandle = FileHandle> {
	readonly source: TextFileHandle;

	updateReady?: Promise<unknown>;

	openRelative(path: string, supportedFilenames?: string[]): Promise<T>;

	openDependency(path: string, supportedFilenames?: string[]): Promise<T>;
}

export interface FileHandleFactory {
	new (context: FileHandleContext): FileHandle;
}
