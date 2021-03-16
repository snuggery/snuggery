import {JsonObject, workspaces} from '@angular-devkit/core';

import type {WorkspaceType} from './interface';

export function isAngularWorkspace(
  filename: string,
  workspace: JsonObject,
): boolean {
  return /^\.?angular\.json$/.test(filename) || workspace.version === 1;
}

export const angularWorkspace: WorkspaceType = {
  async parse(path, host) {
    return (
      await workspaces.readWorkspace(
        path,
        host,
        workspaces.WorkspaceFormat.JSON,
      )
    ).workspace;
  },

  async write(path, host, workspace) {
    await workspaces.writeWorkspace(
      workspace,
      host,
      path,
      workspaces.WorkspaceFormat.JSON,
    );
  },
};
