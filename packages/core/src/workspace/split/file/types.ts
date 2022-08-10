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

	readRelative(
		path: string,
		supportedFilenames?: string[],
	): Promise<FileHandle>;

	readDependency(
		path: string,
		supportedFilenames?: string[],
	): Promise<FileHandle>;
}

export interface FileHandleContext {
	readonly source: TextFileHandle;

	updateReady?: Promise<unknown>;

	readRelative(
		path: string,
		supportedFilenames?: string[],
	): Promise<FileHandle>;

	readDependency(
		path: string,
		supportedFilenames?: string[],
	): Promise<FileHandle>;
}

export interface FileHandleFactory {
	new (context: FileHandleContext): FileHandle;
}
