import type {JsonObject} from '../types';

export interface WorkspaceHost {
	isFile(path: string): Promise<boolean>;

	isDirectory(path: string): Promise<boolean>;

	readdir(path: string): Promise<string[]>;

	read(path: string): Promise<string>;

	write(path: string, value: string): Promise<void>;
}

export interface FileHandle {
	readonly filename: string;

	read(): Promise<JsonObject>;

	write(value: JsonObject): Promise<void>;

	update(updater: (value: JsonObject) => void | Promise<void>): Promise<void>;
}

export interface FileHandleFactory {
	new (source: WorkspaceHost, path: string): FileHandle;
}
