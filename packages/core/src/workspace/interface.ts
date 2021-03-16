import type {workspaces} from '@angular-devkit/core';

export interface WorkspaceType {
  parse(
    path: string,
    host: workspaces.WorkspaceHost,
  ): Promise<workspaces.WorkspaceDefinition>;

  write(
    path: string,
    host: workspaces.WorkspaceHost,
    workspace: workspaces.WorkspaceDefinition,
  ): Promise<void>;
}
