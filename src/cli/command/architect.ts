import {Architect, Target} from '@angular-devkit/architect';
import {json, JsonObject} from '@angular-devkit/core';
import {promises as fs} from 'fs';
import {tmpdir} from 'os';
import {join} from 'path';

import {AtelierArchitectHost, UnknownTargetError} from '../architect/host';
import {Cached} from '../utils/decorator';
import {Option, parseSchema, Type} from '../utils/parse-schema';

import {AbstractCommand} from './abstract-command';

export const configurationOption: Option = {
  name: 'configuration',
  aliases: ['c'],
  hasDefault: false,
  hidden: false,
  required: false,
  type: Type.StringArray,
  description: 'Configuration(s) to use',
};

export class BuilderFailedError extends Error {
  readonly clipanion = {usage: 'none'};

  constructor(message: string) {
    super(message);
    this.name = 'BuilderFailedError';
  }
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
  protected get architectHost(): AtelierArchitectHost {
    return new AtelierArchitectHost(this.context, this.workspace);
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
      schema:
        typeof optionSchema === 'boolean'
          ? optionSchema
          : await this.registry.flatten(optionSchema).toPromise(),
    });
  }

  protected async runTarget({
    target,
    options = {},
  }: {
    target: Target;
    options?: JsonObject;
  }): Promise<number> {
    const run = await this.architect.scheduleTarget(target, options, {
      logger: this.logger,
    });

    let error, success;
    try {
      ({error, success} = await run.output.toPromise());

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
          await fs.mkdtemp(join(tmpdir(), 'atelier-')),
          'error.log',
        );
        await fs.writeFile(file, e.stack);

        message += `\nSee ${file} for more information on the error`;
      }

      throw new BuilderFailedError(message);
    }

    if (error) {
      this.context.stderr.write(error + '\n');
    }

    return success ? 0 : 1;
  }

  protected async runBuilder({
    builder,
    options = {},
  }: {
    builder: string;
    options?: JsonObject;
  }): Promise<number> {
    // the Architect class has a `scheduleBuilder` method, you'd think that was
    // useful, but in fact it's the same as `scheduleTarget` with the sole
    // exception that it expects the target to be passed in as string instead of
    // as Target object.

    return this.runTarget({
      target: this.workspace.makeSyntheticTarget(this.currentProject, builder),
      options,
    });
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
