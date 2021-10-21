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

import {AbstractError} from '../../utils/error';
import {SnuggeryEngineHost} from '../schematic/engine-host';
import {SnuggeryWorkflow} from '../schematic/workflow';
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

export class SchematicFailedError
  extends AbstractError
  implements ErrorWithMeta
{
  readonly clipanion = {type: 'none'} as const;
}

export abstract class SchematicCommand extends AbstractCommand {
  /**
   * Whether to actually commit the changes of the schematic on-disk (false) or not (true)
   *
   * If set to true, an overview of all changed files will always be printed, regardless of `showFileChanges`.
   */
  protected abstract readonly dryRun: boolean;

  /**
   * Commit schematic changes even if they result in conflicts
   */
  protected abstract readonly force: boolean;

  /**
   * Print every file that gets changed
   */
  protected abstract readonly showFileChanges: boolean;

  /**
   * Root directory for the schematic
   *
   * The schematic cannot change files outside of the root.
   */
  protected abstract readonly root: string;

  /**
   * Enable resolving collections wrt the location of Snuggery
   *
   * This allows resolving globally installed collections if Snuggery was
   * installed globally.
   */
  protected readonly resolveSelf: boolean = false;

  /**
   * JSONSchema registry
   *
   * Unlike the registry in the architect family of commands, this registry supports prompting the
   * user for missing options.
   */
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
  protected get engineHost(): SnuggeryEngineHost {
    return new SnuggeryEngineHost(this.root, {
      context: this.context,
      optionTransforms: [
        // Add any option values from the configuration file
        (schematic, current) => ({
          ...this.getConfiguredOptions(schematic),
          ...current,
        }),
      ],
      packageManager: this.packageManager,
      registry: this.registry,
      resolvePaths: [
        this.root,
        ...(this.resolveSelf
          ? [dirname(require.resolve('@snuggery/snuggery/package.json'))]
          : []),
      ],
      schemaValidation: true,
    });
  }

  @Cached()
  protected get workflow(): SnuggeryWorkflow {
    return new SnuggeryWorkflow(this.root, {
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

  protected async getOptions(schematic: FileSystemSchematic): Promise<{
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

      // .schematics[`${collection}:${schematic}`]
      let tmp = schematics[`${collectionName}:${schematicName}`];
      if (tmp != null && isJsonObject(tmp)) {
        Object.assign(options, tmp);
      }

      // .schematics[collection][schematic]
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

  protected resolveSchematic(schematic: string): {
    collectionName: string;
    schematicName: string;
  } {
    if (schematic.includes(':')) {
      const [collectionName, schematicName] = schematic.split(':', 2) as [
        string,
        string,
      ];
      return {collectionName, schematicName};
    } else {
      return {
        collectionName: this.getDefaultCollectionName(),
        schematicName: schematic,
      };
    }
  }

  /**
   * The package name of the default collection
   *
   * This is either configured in the project or the workspace, or the fallback is used.
   */
  protected getDefaultCollectionName(): string {
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
          await fs.mkdtemp(join(tmpdir(), 'snuggery-')),
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
