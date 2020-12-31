import {JsonArray, JsonObject, workspaces} from '@angular-devkit/core';
import {BaseContext, UsageError} from 'clipanion';
import {readFileSync, statSync, writeFileSync} from 'fs';
import {dirname, normalize, relative, resolve, sep} from 'path';
import {findUp} from '../utils/find-up';

export interface Context extends BaseContext {
  /**
   * The folder the command was executed in
   */
  startCwd: string;

  /**
   * The configured workspace, if any
   */
  workspace: CliWorkspace | null;
}

export class CliWorkspace implements workspaces.WorkspaceDefinition {
  constructor(
    private readonly workspace: workspaces.WorkspaceDefinition,
    public readonly basePath: string,
  ) {}

  get extensions(): Record<
    string,
    string | number | boolean | JsonArray | JsonObject | null | undefined
  > {
    return this.workspace.extensions;
  }

  get projects(): workspaces.ProjectDefinitionCollection {
    return this.workspace.projects;
  }

  tryGetProjectNameByCwd(cwd: string): string | null {
    const relativeCwd = normalize(
      relative(this.basePath, resolve(this.basePath, cwd)),
    );

    if (relativeCwd.startsWith('../')) {
      throw new UsageError(`Invalid project path ${relativeCwd}`);
    }

    let longestMatch = '';
    let longestMatchingProject: string | null = null;

    for (const [name, project] of this.projects) {
      const root = normalize(project.root);

      if (root === relativeCwd) {
        longestMatch = root;
        longestMatchingProject = name;
        break;
      }

      if (
        relativeCwd.startsWith(`${root}${sep}`) &&
        root.length > longestMatch.length
      ) {
        longestMatch = root;
        longestMatchingProject = name;
      }
    }

    return longestMatchingProject;
  }

  tryGetProjectByName(name: string): workspaces.ProjectDefinition | null {
    return this.projects.get(name) ?? null;
  }
}

const configFileNames = [
  // Our own (or Nx's tao :shrug:)
  'workspace.json',
  '.workspace.json',

  // Angular
  'angular.json',
  '.angular.json',
];

export async function findWorkspace(
  startingCwd: string,
): Promise<CliWorkspace | null> {
  const workspacePath = findUp(configFileNames, startingCwd);

  if (workspacePath == null) {
    return null;
  }

  const {workspace} = await workspaces.readWorkspace(
    workspacePath,
    createWorkspaceHost(),
    workspaces.WorkspaceFormat.JSON,
  );

  return new CliWorkspace(workspace, dirname(workspacePath));
}

function createWorkspaceHost(): workspaces.WorkspaceHost {
  return {
    async readFile(path) {
      return readFileSync(path, 'utf-8');
    },
    async writeFile(path, data) {
      writeFileSync(path, data);
    },
    async isDirectory(path) {
      try {
        return statSync(path).isDirectory();
      } catch {
        return false;
      }
    },
    async isFile(path) {
      try {
        return statSync(path).isFile();
      } catch {
        return false;
      }
    },
  };
}
