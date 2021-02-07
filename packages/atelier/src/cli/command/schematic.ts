import {isJsonObject, JsonObject, schema} from '@angular-devkit/core';
import {
  DryRunEvent,
  formats,
  UnsuccessfulWorkflowExecution,
} from '@angular-devkit/schematics';
import type {
  FileSystemCollection,
  FileSystemSchematic,
  FileSystemSchematicDescription,
} from '@angular-devkit/schematics/tools';
import type {ErrorWithMeta} from 'clipanion';
import {promises as fs} from 'fs';
import {tmpdir} from 'os';
import {dirname, join, normalize, relative} from 'path';
import getPackageManager from 'which-pm-runs';

import {AtelierEngineHost} from '../schematic/engine-host';
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

export class SchematicFailedError extends Error implements ErrorWithMeta {
  readonly clipanion = {type: 'none'} as const;

  constructor(message: string) {
    super(message);
    this.name = 'SchematicFailedError';
  }
}

export abstract class SchematicCommand extends AbstractCommand {
  protected abstract readonly dryRun: boolean;

  protected abstract readonly force: boolean;

  protected abstract readonly showFileChanges: boolean;

  protected abstract readonly root: string;

  /**
   * Enable resolving collections wrt the location of Atelier
   *
   * This allows resolving globally installed collections if Atelier was
   * installed globally.
   */
  protected readonly resolveSelf: boolean = false;

  @Cached()
  protected get registry(): schema.CoreSchemaRegistry {
    const registry = new schema.CoreSchemaRegistry(formats.standardFormats);

    registry.addPostTransform(schema.transforms.addUndefinedDefaults);
    registry.addSmartDefaultProvider('projectName', () => this.currentProject);
    registry.useXDeprecatedProvider(msg =>
      this.context.report.reportWarning(msg),
    );

    registry.usePromptProvider(createPromptProvider());

    return registry;
  }

  @Cached()
  protected get engineHost(): AtelierEngineHost {
    return new AtelierEngineHost(this.root, {
      context: this.context,
      optionTransforms: [
        // Add any option values from the configuration file
        (schematic, current) => ({
          ...this.getConfiguredOptions(schematic),
          ...current,
        }),
      ],
      packageManager: getPackageManager()?.name,
      registry: this.registry,
      resolvePaths: [
        this.context.startCwd,
        this.root,
        ...(this.resolveSelf
          ? [dirname(require.resolve('@bgotink/atelier/package.json'))]
          : []),
      ],
      schemaValidation: true,
    });
  }

  @Cached()
  protected get workflow(): AtelierWorkflow {
    return new AtelierWorkflow(this.root, {
      engineHost: this.engineHost,
      force: this.force,
      dryRun: this.dryRun,
      registry: this.registry,
    });
  }

  protected getCollection(collectionName: string): FileSystemCollection {
    return this.workflow.engine.createCollection(collectionName);
  }

  protected getSchematic(
    collectionName: string,
    schematicName: string,
    allowPrivate?: boolean,
  ): FileSystemSchematic {
    return this.getCollection(collectionName).createSchematic(
      schematicName,
      allowPrivate,
    );
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
      schema: schemaJson,
    });
  }

  protected getConfiguredOptions(
    schematic: FileSystemSchematicDescription,
  ): JsonObject {
    const {workspace} = this.context;

    if (workspace == null) {
      return {};
    }

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

    const subscription = workflow.reporter.subscribe((event: DryRunEvent) => {
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
      subscription.add(
        workflow.lifeCycle.subscribe(event => {
          if (event.kind == 'end' || event.kind == 'post-tasks-start') {
            if (!hasError) {
              loggingQueue.forEach(log => this.context.report.reportInfo(log));
            }

            loggingQueue.length = 0;
            hasError = false;
          }
        }),
      );
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

      if (!(e instanceof Error)) {
        throw new SchematicFailedError(
          `The schematic failed with non-error: ${JSON.stringify(e)}`,
        );
      }

      let message = `The schematic failed with underlying ${e.name}: ${e.message}`;

      if (e.stack) {
        const file = join(
          await fs.mkdtemp(join(tmpdir(), 'atelier-')),
          'error.log',
        );
        await fs.writeFile(file, e.stack);

        message += `\nSee ${file} for more information on the error`;
      }

      throw new SchematicFailedError(message);
    } finally {
      subscription.unsubscribe();
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
