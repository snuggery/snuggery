import {Target} from '@angular-devkit/architect';
import {JsonArray, JsonObject, workspaces} from '@angular-devkit/core';
import {BaseContext, UsageError} from 'clipanion';
import {promises as fs} from 'fs';
import {dirname, normalize, relative, resolve, sep} from 'path';
import {findUp} from '../utils/find-up';
import {Report} from '../utils/report';
import {
  isTaoWorkspaceConfiguration,
  mapTaoWorkspaceToAngularWorkspace,
} from '../utils/tao';

export interface Context extends BaseContext {
  /**
   * The folder the command was executed in
   */
  startCwd: string;

  /**
   * The configured workspace, if any
   */
  workspace: CliWorkspace | null;

  /**
   * Report / logger
   */
  report: Report;
}

export class CliWorkspace implements workspaces.WorkspaceDefinition {
  private syntheticProject?: workspaces.ProjectDefinition;

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

  get defaultProject(): string | null {
    return typeof this.extensions.defaultProject === 'string'
      ? this.extensions.defaultProject
      : null;
  }

  tryGetProjectNameByCwd(
    cwd: string,
    warn: (message: string) => void,
  ): string | null {
    const relativeCwd = normalize(
      relative(this.basePath, resolve(this.basePath, cwd)),
    );

    if (relativeCwd.startsWith('../')) {
      throw new UsageError(`Invalid project path ${relativeCwd}`);
    }

    let longestMatch = '';
    let longestMatchingProject: string | null = null;

    let warnDuplicate = false;

    for (const [name, project] of this.projects) {
      const root = normalize(project.root);

      if (root === relativeCwd) {
        if (longestMatch === root) {
          warnDuplicate = true;
          longestMatchingProject = this.defaultProject;
        } else {
          warnDuplicate = false;
          longestMatch = root;
          longestMatchingProject = name;
        }
      } else if (
        relativeCwd.startsWith(`${root}${sep}`) &&
        root.length > longestMatch.length
      ) {
        if (longestMatch === root) {
          warnDuplicate = true;
          longestMatchingProject = this.defaultProject;
        } else {
          warnDuplicate = false;
          longestMatch = root;
          longestMatchingProject = name;
        }
      }
    }

    if (warnDuplicate) {
      warn(
        `Multiple projects have the same root ${relativeCwd}, using the default project "${longestMatchingProject}"`,
      );
    }

    return longestMatchingProject;
  }

  tryGetProjectByName(name: string): workspaces.ProjectDefinition | null {
    return this.projects.get(name) ?? null;
  }

  makeSyntheticTarget(projectName: string | null, builder: string): Target {
    let project;
    if (projectName == null) {
      projectName = '@synthetic/project';
      project = this.syntheticProject ??= this.projects.add({
        name: projectName,
        root: '',
      });
    } else {
      project = this.tryGetProjectByName(projectName);
      if (project == null) {
        throw new UsageError(`Unknown project "${projectName}"`);
      }
    }

    const targetName = `$$synthetic-${Date.now()}$$`;
    project.targets.add({
      name: targetName,
      builder,
    });

    return {
      project: projectName,
      target: targetName,
    };
  }
}

const configFileNames = [
  // Our own
  'atelier.json',
  '.atelier.json',

  // Nx's tao
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

  const host = new AtelierWorkspaceHost();

  let version = 1;
  try {
    const workspaceJson = JSON.parse(await host.readFile(workspacePath));

    if (typeof workspaceJson.version === 'number') {
      ({version} = workspaceJson);
    }
  } catch {
    // default to v1, angular will throw something useful
  }

  if (isTaoWorkspaceConfiguration(workspacePath, version)) {
    host.mockFile(
      workspacePath,
      JSON.stringify(
        mapTaoWorkspaceToAngularWorkspace(
          JSON.parse(await host.readFile(workspacePath)),
        ),
        null,
        2,
      ),
    );
  }

  const {workspace} = await workspaces.readWorkspace(
    workspacePath,
    host,
    workspaces.WorkspaceFormat.JSON,
  );

  return new CliWorkspace(workspace, dirname(workspacePath));
}

class AtelierWorkspaceHost implements workspaces.WorkspaceHost {
  private readonly mocked = new Map<string, string>();

  async readFile(path: string): Promise<string> {
    const mocked = this.mocked.get(path);
    return mocked ?? fs.readFile(path, 'utf-8');
  }

  async writeFile(path: string, data: string): Promise<void> {
    await fs.writeFile(path, data);
  }

  mockFile(path: string, data: string) {
    this.mocked.set(path, data);
  }

  async isDirectory(path: string): Promise<boolean> {
    try {
      return (await fs.stat(path)).isDirectory();
    } catch {
      return false;
    }
  }

  async isFile(path: string): Promise<boolean> {
    try {
      return (await fs.stat(path)).isFile();
    } catch {
      return false;
    }
  }
}
