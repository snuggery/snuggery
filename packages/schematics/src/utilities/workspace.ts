import {virtualFs} from '@angular-devkit/core';
import type {Rule, Tree} from '@angular-devkit/schematics';
import {
  updateWorkspace as _updateWorkspace,
  WorkspaceHost,
  WorkspaceDefinition,
  parseWorkspace,
} from '@snuggery/core';

function createHost(tree: Tree): WorkspaceHost {
  return {
    async readFile(path) {
      const data = tree.read(path);
      if (!data) {
        throw new Error('File not found.');
      }
      return virtualFs.fileBufferToString(data);
    },
    async writeFile(path, data) {
      return tree.overwrite(path, data);
    },
    async isDirectory(path) {
      // approximate a directory check
      return !tree.exists(path) && tree.getDir(path).subfiles.length > 0;
    },
    async isFile(path) {
      return tree.exists(path);
    },
  };
}

export function getWorkspace(tree: Tree): Promise<WorkspaceDefinition> {
  return parseWorkspace('/', createHost(tree));
}

export function updateWorkspace(
  updater: (workspace: WorkspaceDefinition) => void | Promise<void>,
): Rule {
  return async tree => {
    await _updateWorkspace('/', createHost(tree), updater);
  };
}
