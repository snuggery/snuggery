import type {Tree} from '@angular-devkit/schematics';
import {
	updateWorkspace as _updateWorkspace,
	WorkspaceHost,
	WorkspaceDefinition,
	readWorkspace,
} from '@snuggery/core';

function createHost(tree: Tree): WorkspaceHost {
	return {
		async read(path) {
			const data = tree.read(path);
			if (!data) {
				throw new Error('File not found.');
			}
			return data.toString('utf-8');
		},
		async write(path, data) {
			return tree.overwrite(path, data);
		},
		async isDirectory(path) {
			// approximate a directory check
			return !tree.exists(path) && tree.getDir(path).subfiles.length > 0;
		},
		async isFile(path) {
			return tree.exists(path);
		},
		async readdir(path) {
			const dir = tree.getDir(path);
			return [...dir.subfiles, ...dir.subdirs];
		},
	};
}

export function getWorkspace(tree: Tree): Promise<WorkspaceDefinition> {
	return readWorkspace('/', {host: createHost(tree)});
}

export function updateWorkspace(
	updater: (workspace: WorkspaceDefinition) => void | Promise<void>,
): (tree: Tree) => Promise<void> {
	return async (tree) => {
		await _updateWorkspace('/', updater, {host: createHost(tree)});
	};
}
