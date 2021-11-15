import {promises as fs} from 'fs';

import type {WorkspaceHost} from './file';

export const nodeFsHost: WorkspaceHost = {
	async isDirectory(path) {
		try {
			return (await fs.stat(path)).isDirectory();
		} catch {
			return false;
		}
	},
	async isFile(path) {
		try {
			return (await fs.stat(path)).isFile();
		} catch {
			return false;
		}
	},
	async read(path) {
		return await fs.readFile(path, 'utf-8');
	},
	async readdir(path) {
		return await fs.readdir(path);
	},
	async write(path, content) {
		await fs.writeFile(path, content);
	},
};
