import {
  Architect,
  BuilderOutput,
  BuilderRun,
  Target,
} from '@angular-devkit/architect';
import {isJsonArray, json, JsonObject} from '@angular-devkit/core';
import type {ErrorWithMeta} from 'clipanion';
import {promises as fs} from 'fs';
import {tmpdir} from 'os';
import {join} from 'path';

import {
  createArchitectHost,
  SnuggeryArchitectHost,
  UnknownTargetError,
} from '../architect';
import {Cached} from '../utils/decorator';
import {Option, parseSchema, Type} from '../utils/parse-schema';

import {AbstractCommand} from './abstract-command';
import type {Context} from './context';

export const configurationOption: Option = {
  name: 'configuration',
  aliases: ['c'],
  hasDefault: false,
  hidden: false,
  required: false,
  type: Type.StringArray,
  description: 'Configuration(s) to use',
};

export class BuilderFailedError extends Error implements ErrorWithMeta {
  readonly clipanion = {type: 'none'} as const;

  constructor(message: string) {
    super(message);
    this.name = 'BuilderFailedError';
  }
}

async function handleBuilderRun(run: BuilderRun, context: Context) {
  let result: BuilderOutput;
  try {
    result = await run.output.toPromise();

    await run.stop();
  } catch (e) {
    if (!(e instanceof Error)) {
      throw new BuilderFailedError(
        `Builder failed with non-error: ${JSON.stringify(e)}`,
      );
    }

    let message = `Build failed with underlying ${e.name}: ${e.message}`;

    if (e.stack) {
      const file = join(
        await fs.mkdtemp(join(tmpdir(), 'snuggery-')),
        'error.log',
      );
      await fs.writeFile(file, e.stack);

      message += `\nSee ${file} for more information on the error`;
    }

    throw new BuilderFailedError(message);
  }

  if (result == null) {
    context.report.reportWarning(
      'Builder exited without emitting a value, assuming success',
    );
    result = {success: true};
  }

  if (result.error) {
    context.report.reportError(result.error);
  }

  return result.success ? 0 : 1;
}

export function addConfigurationsToTarget(
  target: Target,
  options: JsonObject,
  initialConfigurations: ReadonlySet<string>,
): Target {
  const configurations = new Set(initialConfigurations);

  if (typeof options.configuration === 'string') {
    for (const value of options.configuration
      .split(',')
      .map(configuration => configuration.trim())) {
      if (value) {
        configurations.add(value);
      }
    }
    delete options.configuration;
  } else if (isJsonArray(options.configuration!)) {
    for (const value of options.configuration) {
      if (typeof value === 'string') {
        configurations.add(value.trim());
      }
    }
    delete options.configuration;
  }

  if (configurations.size === 0) {
    return target;
  }

  return {
    ...target,
    configuration: Array.from(configurations).join(','),
  };
}

export abstract class ArchitectCommand extends AbstractCommand {
  @Cached()
  protected get registry(): json.schema.SchemaRegistry {
    const registry = new json.schema.CoreSchemaRegistry();
    registry.addPostTransform(json.schema.transforms.addUndefinedDefaults);
    registry.useXDeprecatedProvider(msg => this.report.reportWarning(msg));

    return registry;
  }

  @Cached()
  protected get architectHost(): SnuggeryArchitectHost {
    return createArchitectHost(this.context, this.context.workspace);
  }

  @Cached()
  protected get architect(): Architect {
    return new Architect(this.architectHost, this.registry);
  }

  @Cached()
  protected get defaultProject(): string | null {
    const {defaultProject} = this.workspace.extensions;

    if (typeof defaultProject === 'string') {
      return defaultProject;
    }

    return null;
  }

  @Cached()
  protected get uniqueTargets(): ReadonlyMap<string, string> {
    const allTargets = new Map<string, string>();
    const nonUniqueTargets = new Set<string>();

    for (const [project, {targets}] of this.workspace.projects) {
      for (const target of targets.keys()) {
        if (allTargets.has(target)) {
          nonUniqueTargets.add(target);
        } else {
          allTargets.set(target, project);
        }
      }
    }

    return new Map(
      Array.from(allTargets).filter(
        ([target]) => !nonUniqueTargets.has(target),
      ),
    );
  }

  protected getConfigurations(
    this: ArchitectCommand & {configuration?: string[]},
  ): Set<string> {
    return new Set(
      this.configuration
        ?.flatMap(c => c.split(','))
        .map(configuration => configuration.trim()),
    );
  }

  protected async getOptionsForTarget(
    target: Target,
  ): Promise<{
    options: Option[];
    allowExtraOptions: boolean;
    description?: string | undefined;
  }> {
    return this.getOptionsForBuilder(
      await this.architectHost.getBuilderNameForTarget(target),
    );
  }

  protected async getOptionsForBuilder(
    builderConf: string,
  ): Promise<{
    options: Option[];
    allowExtraOptions: boolean;
    description?: string | undefined;
  }> {
    const {description, optionSchema} = await this.architectHost.resolveBuilder(
      builderConf,
    );

    return parseSchema({
      description,
      schema: optionSchema,
    });
  }

  protected async runTarget({
    target,
    options = {},
  }: {
    target: Target;
    options?: JsonObject;
  }): Promise<number> {
    return handleBuilderRun(
      await this.architect.scheduleTarget(target, options, {
        logger: this.logger,
      }),
      this.context,
    );
  }

  protected async runBuilder({
    builder,
    options = {},
  }: {
    builder: string;
    options?: JsonObject;
  }): Promise<number> {
    return handleBuilderRun(
      await this.architect.scheduleBuilder(builder, options, {
        logger: this.logger,
      }),
      this.context,
    );
  }

  protected resolveTarget(target: string, projectName: string | null): Target {
    if (projectName != null) {
      return {project: projectName, target};
    }

    const {currentProject, workspace} = this;

    if (currentProject != null) {
      const project = workspace.getProjectByName(currentProject);
      if (project.targets.has(target)) {
        return {project: currentProject, target};
      }
    }

    const {defaultProject} = this;

    if (typeof defaultProject === 'string') {
      const project = workspace.tryGetProjectByName(defaultProject);

      if (project == null) {
        this.context.report.reportWarning(
          `Couldn't find configured default project ${JSON.stringify(
            defaultProject,
          )} in the workspace`,
        );
      } else if (project.targets.has(target)) {
        return {project: defaultProject, target};
      }
    }

    const {uniqueTargets} = this;

    if (uniqueTargets.has(target)) {
      return {project: uniqueTargets.get(target)!, target};
    }

    throw new UnknownTargetError(
      `Failed to resolve target ${JSON.stringify(
        target,
      )}, try passing a project name`,
    );
  }
}
