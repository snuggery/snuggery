import {isJsonObject, JsonObject, schema} from '@angular-devkit/core';
import {
  FileSystemCollection,
  FileSystemEngine,
  FileSystemSchematic,
  FileSystemSchematicDescription,
  NodeWorkflow,
} from '@angular-devkit/schematics/tools';
import {
  DryRunEvent,
  formats,
  UnsuccessfulWorkflowExecution,
} from '@angular-devkit/schematics';
import {UsageError} from 'clipanion';
import {normalize, relative} from 'path';
import getPackageManager from 'which-pm-runs';

import {Cached} from '../utils/decorator';
import {parseSchema, Option} from '../utils/parse-schema';
import {AbstractCommand} from './abstract-command';

export const reservedNames: ReadonlySet<string> = new Set([
  '--show-file-changes',
]);

export abstract class SchematicCommand extends AbstractCommand {
  public abstract readonly dryRun: boolean;

  public abstract readonly force: boolean;

  @AbstractCommand.Boolean('--show-file-changes', {
    description: 'Print an overview of all file changes made by the schematic',
  })
  public showFileChanges = false;

  protected abstract readonly root: string;

  @Cached()
  public get workflow(): NodeWorkflow {
    const workflow = new NodeWorkflow(this.root, {
      force: this.force,
      dryRun: this.dryRun,
      packageManager: getPackageManager()?.name,
      packageRegistry: undefined,
      registry: new schema.CoreSchemaRegistry(formats.standardFormats),
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

    workflow.registry.addPostTransform(schema.transforms.addUndefinedDefaults);
    workflow.registry.addSmartDefaultProvider(
      'projectName',
      () => this.currentProject,
    );
    workflow.registry.useXDeprecatedProvider(msg => this.logger.warn(msg));

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
    const relativeCwd = normalize(
      relative(this.workspace.basePath, this.context.startCwd),
    );

    if (relativeCwd === '.') {
      return {};
    }

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

  protected async getOptions(collection: string, schematic: string) {
    return parseSchema(
      this.getSchematic(this.getCollection(collection), schematic).description,
    );
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
      let project =
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

    return '@schematics/angular';
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
        this.logger.warn(
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
          case 'rename':
            const to = event.to.replace(/^\//, '');
            loggingQueue.push(`${'RENAME'} ${path} => ${to}`);
            break;
        }
      }
    });

    if (shouldPrintFileChanges) {
      workflow.lifeCycle.subscribe(event => {
        if (event.kind == 'end' || event.kind == 'post-tasks-start') {
          if (!hasError) {
            loggingQueue.forEach(log => this.logger.info(log));
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
        this.logger.fatal('The schematic workflow failed. See above.');
      } else {
        this.context.stderr.write(this.cli.error(e));
      }

      return 1;
    }

    if (!madeAChange) {
      this.logger.warn('Nothing to do');
    } else if (this.dryRun) {
      this.logger.info(
        '\nNote: no changes were made, run without `--dry-run` to actually make the changes',
      );
    }

    return 0;
  }
}
