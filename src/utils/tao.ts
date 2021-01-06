import {BuilderOutput, createBuilder} from '@angular-devkit/architect';
import type {Builder} from '@angular-devkit/architect/src/internal';
import type {JsonObject} from '@angular-devkit/core';
import type {
  Rule,
  RuleFactory,
  TaskConfiguration,
  TaskConfigurationGenerator,
  TaskExecutor,
  TaskExecutorFactory,
  Tree as NgTree,
} from '@angular-devkit/schematics';
import type {FileSystemEngineHostBase} from '@angular-devkit/schematics/tools';
import type {
  Tree as NxTree,
  ProjectConfiguration,
  TargetConfiguration,
  TargetContext,
  WorkspaceConfiguration,
  FileChange,
} from '@nrwl/devkit';
import {basename} from 'path';
import type {CliWorkspace} from '../command/context';

export type Executor = (
  options: JsonObject,
  context: TargetContext,
) => Promise<BuilderOutput>;

export function makeExecutorIntoBuilder(
  executor: Executor,
  workspace: CliWorkspace,
): Builder<JsonObject> {
  return createBuilder(async (options, ngContext) => {
    const nxContext: TargetContext = {
      get root() {
        return ngContext.workspaceRoot;
      },

      get target(): TargetConfiguration {
        if (ngContext.target == null) {
          return {
            executor: ngContext.builder.builderName,
          };
        }

        const target = workspace.projects
          .get(ngContext.target.project)
          ?.targets.get(ngContext.target.target);

        return {
          executor: ngContext.builder.builderName,
          options: target?.options,
          configurations: target?.configurations,
        };
      },

      get workspace(): WorkspaceConfiguration {
        /* eslint-disable @typescript-eslint/no-explicit-any */
        return {
          projects: Object.fromEntries(
            Array.from(workspace.projects, ([projectName, project]): [
              string,
              ProjectConfiguration,
            ] => {
              return [
                projectName,
                {
                  targets: Object.fromEntries(
                    Array.from(
                      project.targets,
                      ([targetName, {builder, configurations, options}]): [
                        string,
                        TargetConfiguration,
                      ] => {
                        return [
                          targetName,
                          {
                            executor: builder,
                            configurations,
                            options,
                          },
                        ];
                      },
                    ),
                  ),

                  root: project.root,
                  generators: project.extensions.schematics as any,
                  projectType: project.extensions.projectType as
                    | 'library'
                    | 'application',
                  sourceRoot: project.sourceRoot,
                },
              ];
            }),
          ),

          defaultProject: workspace.defaultProject ?? undefined,
          cli: workspace.extensions.cli as any,
          generators: workspace.extensions.schematics as any,
        };
        /* eslint-enable @typescript-eslint/no-explicit-any */
      },
    };

    return executor(options, nxContext);
  });
}

export type Generator = (
  host: NxTree,
  schema: JsonObject,
) => Promise<(host: NxTree) => void | undefined>;

class MappedTree implements NxTree {
  constructor(private readonly tree: NgTree, readonly root: string) {}

  read(filePath: string): Buffer | null {
    return this.tree.read(filePath);
  }

  write(filePath: string, content: string | Buffer): void {
    if (this.tree.exists(filePath)) {
      return this.tree.overwrite(filePath, content);
    } else {
      return this.tree.create(filePath, content);
    }
  }

  exists(filePath: string): boolean {
    return this.tree.exists(filePath);
  }

  delete(filePath: string): void {
    return this.tree.delete(filePath);
  }

  rename(from: string, to: string): void {
    return this.tree.rename(from, to);
  }

  isFile(filePath: string): boolean {
    return this.tree.exists(filePath);
  }

  children(dirPath: string): string[] {
    const dirEntry = this.tree.getDir(dirPath);
    return [...dirEntry.subdirs, ...dirEntry.subfiles];
  }

  listChanges(): FileChange[] {
    const typeMap = {
      c: 'CREATE',
      o: 'UPDATE',
      d: 'DELETE',
      r: 'UPDATE',
    } as const;

    return this.tree.actions.flatMap(action => {
      if (action.kind === 'r') {
        return [
          {
            path: action.path,
            type: 'DELETE',
            content: null,
          },
          {
            path: action.to,
            type: 'CREATE',
            content: this.read(action.to),
          },
        ];
      }

      return {
        path: action.path,
        type: typeMap[action.kind],
        content: action.kind === 'd' ? null : action.content,
      };
    });
  }
}

interface ExecuteAfterSchematicOptions {
  task?: () => void | Promise<void>;
}

class ExecuteAfterSchematicTask
  implements TaskConfigurationGenerator<ExecuteAfterSchematicOptions> {
  constructor(private readonly task: () => void | Promise<void>) {}

  toConfiguration(): TaskConfiguration<ExecuteAfterSchematicOptions> {
    return {
      name: 'executeNxTaskAfterSchematic',
      options: {task: this.task},
    };
  }
}

const executeAfterSchematicTaskFactory: TaskExecutorFactory<void> = {
  name: 'executeNxTaskAfterSchematic',

  async create(): Promise<TaskExecutor<ExecuteAfterSchematicOptions>> {
    return async ({task}: ExecuteAfterSchematicOptions = {}) => {
      await task?.();
    };
  },
};

export function makeGeneratorIntoSchematic(
  generator: Generator,
  root: string,
  engineHost: FileSystemEngineHostBase,
): RuleFactory<JsonObject> {
  return (options: JsonObject): Rule => async (ngTree, context) => {
    const nxTree = new MappedTree(ngTree, root);

    const task = await generator(nxTree, options);

    if (task != null) {
      engineHost.registerTaskExecutor(executeAfterSchematicTaskFactory);
      context.addTask(new ExecuteAfterSchematicTask(() => task(nxTree)));
    }
  };
}

const possibleTaoWorkspaces = new Set([
  'workspace.json',
  '.workspace.json',
  'angular.json',
  '.angular.json',
]);
export function isTaoWorkspaceConfiguration(
  path: string,
  version: number,
): boolean {
  return possibleTaoWorkspaces.has(basename(path)) && version === 2;
}

export function mapTaoWorkspaceToAngularWorkspace({
  generators,
  schematics,
  projects,
  ...rest
}: JsonObject): JsonObject {
  return {
    ...rest,
    version: 1,
    schematics: generators ?? schematics ?? {},
    projects: Object.fromEntries(
      Object.entries(projects as Record<string, JsonObject>).map(
        ([
          projectName,
          {generators, schematics, targets, architect, ...project},
        ]) => {
          return [
            projectName,
            {
              ...project,
              schematics: generators ?? schematics ?? {},
              architect: Object.fromEntries(
                Object.entries(
                  architect ?? targets ?? ({} as JsonObject),
                ).map(([targetName, {executor, ...target}]) => [
                  targetName,
                  {...target, builder: executor},
                ]),
              ),
            },
          ];
        },
      ),
    ),
  };
}
