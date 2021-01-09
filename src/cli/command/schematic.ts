import {isJsonObject, JsonObject, schema} from '@angular-devkit/core';
import {
  DryRunEvent,
  formats,
  UnsuccessfulWorkflowExecution,
} from '@angular-devkit/schematics';
import type {
  FileSystemCollection,
  FileSystemEngine,
  FileSystemSchematic,
  FileSystemSchematicDescription,
} from '@angular-devkit/schematics/tools';
import {UsageError} from 'clipanion';
import {normalize, relative} from 'path';
import getPackageManager from 'which-pm-runs';

import {AtelierWorkflow} from '../schematic/workflow';
import {Cached} from '../utils/decorator';
import {parseSchema, Option, Type} from '../utils/parse-schema';
import {createPromptProvider} from '../utils/prompt';

import {AbstractCommand} from './abstract-command';

export const forceOption: Option = {
  name: 'force',
  aliases: [],
  hasDefault: true,
  hidden: false,
  required: false,
  type: Type.Boolean,
  description: 'Write the results to disk even if there are conflicts',
};

export const dryRunOption: Option = {
  name: 'dryRun',
  aliases: [],
  hasDefault: true,
  hidden: false,
  required: false,
  type: Type.Boolean,
  description: 'Run the schematics without writing the results to disk',
};

export const defaultSchematicCollection = '@schematics/angular';

export abstract class SchematicCommand extends AbstractCommand {
  public abstract readonly dryRun: boolean;

  public abstract readonly force: boolean;

  public abstract readonly showFileChanges: boolean;

  protected abstract readonly root: string;

  @Cached()
  public get workflow(): AtelierWorkflow {
    const registry = new schema.CoreSchemaRegistry(formats.standardFormats);

    const workflow = new AtelierWorkflow(this.root, {
      context: this.context,
      force: this.force,
      dryRun: this.dryRun,
      packageManager: getPackageManager()?.name,
      registry,
      resolvePaths: [this.context.startCwd, this.root],
      schemaValidation: true,
      optionTransforms: [
        // Add any option values from the configuration file
        (schematic, current) => ({
          ...this.getConfiguredOptions(schematic),
          ...current,
        }),
      ],
    });

    registry.addPostTransform(schema.transforms.addUndefinedDefaults);
    registry.addSmartDefaultProvider('projectName', () => this.currentProject);
    registry.useXDeprecatedProvider(msg =>
      this.context.report.reportWarning(msg),
    );

    registry.usePromptProvider(createPromptProvider());

    return workflow;
  }

  protected get engine(): FileSystemEngine {
    return this.workflow.engine;
  }

  protected getCollection(collectionName: string): FileSystemCollection {
    const collection = this.engine.createCollection(collectionName);

    if (collection === null) {
      throw new UsageError(`Couldn't find collection "${collectionName}"`);
    }

    return collection;
  }

  protected createPathPartialOptions(options: Option[]): JsonObject {
    if (this.context.workspace == null) {
      return {};
    }

    const relativeCwd = normalize(
      relative(this.context.workspace.basePath, this.context.startCwd),
    );

    return Object.fromEntries(
      options.filter(o => o.format === 'path').map(o => [o.name, relativeCwd]),
    );
  }

  protected getSchematic(
    collection: FileSystemCollection,
    schematicName: string,
    allowPrivate?: boolean,
  ): FileSystemSchematic {
    return collection.createSchematic(schematicName, allowPrivate);
  }

  protected async getOptions(
    schematic: FileSystemSchematic,
  ): Promise<{
    options: Option[];
    allowExtraOptions: boolean;
    description?: string | undefined;
  }> {
    const {description, schemaJson} = schematic.description;
    return parseSchema({
      description,
      schema:
        schemaJson &&
        (await this.workflow.registry.flatten(schemaJson).toPromise()),
    });
  }

  protected getConfiguredOptions(
    schematic: FileSystemSchematicDescription,
  ): JsonObject {
    const {workspace} = this;

    const projectName = this.currentProject;
    const project =
      projectName != null
        ? this.workspace.tryGetProjectByName(projectName)
        : null;

    const options: JsonObject = {};
    const collectionName = schematic.collection.name;
    const schematicName = schematic.name;

    for (const {
      extensions: {schematics},
    } of project ? [workspace, project] : [workspace]) {
      if (!isJsonObject(schematics!)) {
        continue;
      }

      // collection:schematic
      let tmp = schematics[`${collectionName}:${schematicName}`];
      if (tmp != null && isJsonObject(tmp)) {
        Object.assign(options, tmp);
      }

      tmp = schematics[collectionName];
      if (
        tmp != null &&
        isJsonObject(tmp) &&
        isJsonObject(tmp[schematicName]!)
      ) {
        Object.assign(options, tmp[schematicName]);
      }
    }

    return options;
  }

  protected getDefaultCollection(): string {
    const workspace = this.context.workspace;

    if (workspace != null) {
      const projectName = this.currentProject;
      const project =
        projectName != null ? workspace.tryGetProjectByName(projectName) : null;

      if (project != null) {
        const projectCli = project.extensions.cli;
        if (
          projectCli != null &&
          isJsonObject(projectCli) &&
          typeof projectCli.defaultCollection === 'string'
        ) {
          return projectCli.defaultCollection;
        }
      }

      const workspaceCli = workspace.extensions.cli;
      if (
        workspaceCli != null &&
        isJsonObject(workspaceCli) &&
        typeof workspaceCli.defaultCollection === 'string'
      ) {
        return workspaceCli.defaultCollection;
      }
    }

    return defaultSchematicCollection;
  }

  protected async runSchematic({
    schematic,
    options = {},
    allowPrivateSchematics = false,
  }: {
    schematic: FileSystemSchematic;
    options?: JsonObject;
    allowPrivateSchematics?: boolean;
  }): Promise<number> {
    const shouldPrintFileChanges = this.dryRun || this.showFileChanges;
    const loggingQueue: string[] = [];

    let madeAChange = false;
    let hasError = false;

    const {workflow} = this;

    workflow.reporter.subscribe((event: DryRunEvent) => {
      madeAChange = true;

      const path = event.path.replace(/^\//, '');

      if (event.kind === 'error') {
        hasError = true;
        this.context.report.reportWarning(
          `Error: ${path} ${
            event.description == 'alreadyExist'
              ? 'already exists'
              : 'does not exist'
          }.`,
        );
      } else if (shouldPrintFileChanges) {
        switch (event.kind) {
          case 'update':
            loggingQueue.push(
              `${'UPDATE'} ${path} (${event.content.length} bytes)`,
            );
            break;
          case 'create':
            loggingQueue.push(
              `${'CREATE'} ${path} (${event.content.length} bytes)`,
            );
            break;
          case 'delete':
            loggingQueue.push(`${'DELETE'} ${path}`);
            break;
          case 'rename': {
            const to = event.to.replace(/^\//, '');
            loggingQueue.push(`${'RENAME'} ${path} => ${to}`);
            break;
          }
        }
      }
    });

    if (shouldPrintFileChanges) {
      workflow.lifeCycle.subscribe(event => {
        if (event.kind == 'end' || event.kind == 'post-tasks-start') {
          if (!hasError) {
            loggingQueue.forEach(log => this.context.report.reportInfo(log));
          }

          loggingQueue.length = 0;
          hasError = false;
        }
      });
    }

    try {
      await workflow
        .execute({
          collection: schematic.description.collection.name,
          schematic: schematic.description.name,
          options,
          logger: this.logger,
          allowPrivate: allowPrivateSchematics,
        })
        .toPromise();
    } catch (e) {
      if (e instanceof UnsuccessfulWorkflowExecution) {
        this.context.report.reportError(
          'The schematic workflow failed. See above.',
        );
        return 1;
      }

      throw e;
    }

    if (!madeAChange) {
      this.context.report.reportWarning('Nothing to do');
    } else if (this.dryRun) {
      this.context.report.reportInfo(
        '\nNote: no changes were made, run without `--dry-run` to actually make the changes',
      );
    }

    return 0;
  }
}
