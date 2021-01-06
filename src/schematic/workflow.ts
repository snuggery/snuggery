import {
  getSystemPath,
  normalize,
  schema,
  virtualFs,
} from '@angular-devkit/core';
import {NodeJsSyncHost} from '@angular-devkit/core/node';
import {workflow} from '@angular-devkit/schematics';
import {BuiltinTaskExecutor} from '@angular-devkit/schematics/tasks/node';
import {
  FileSystemEngine,
  NodeModulesEngineHost,
  OptionTransform,
  validateOptionsWithSchema,
} from '@angular-devkit/schematics/tools';

import type {Context} from '../command/context';

import {AtelierEngineHost} from './engine-host';

export interface AtelierWorkflowOptions {
  context: Context;
  force: boolean;
  dryRun: boolean;
  packageManager?: string;
  registry: schema.CoreSchemaRegistry;
  resolvePaths?: string[];
  schemaValidation?: boolean;
  optionTransforms?: OptionTransform<object, object>[];
}

/**
 * A workflow specifically for Node tools.
 */
export class AtelierWorkflow extends workflow.BaseWorkflow {
  constructor(_root: string, options: AtelierWorkflowOptions) {
    const root = normalize(_root);
    const host = new virtualFs.ScopedHost(new NodeJsSyncHost(), root);

    const engineHost = new AtelierEngineHost(
      options.context,
      options.resolvePaths,
    );
    super({
      host,
      engineHost,

      force: options.force,
      dryRun: options.dryRun,
      registry: options.registry,
    });

    engineHost.registerTaskExecutor(BuiltinTaskExecutor.NodePackage, {
      allowPackageManagerOverride: true,
      packageManager: options.packageManager,
      rootDirectory: getSystemPath(root),
    });
    engineHost.registerTaskExecutor(BuiltinTaskExecutor.RepositoryInitializer, {
      rootDirectory: getSystemPath(root),
    });
    engineHost.registerTaskExecutor(BuiltinTaskExecutor.RunSchematic);
    engineHost.registerTaskExecutor(BuiltinTaskExecutor.TslintFix);

    if (options.optionTransforms) {
      for (const transform of options.optionTransforms) {
        engineHost.registerOptionsTransform(transform);
      }
    }

    if (options.schemaValidation) {
      engineHost.registerOptionsTransform(
        validateOptionsWithSchema(this.registry),
      );
    }

    this._context = [];
  }

  get engine(): FileSystemEngine {
    return this._engine as FileSystemEngine;
  }

  get engineHost(): NodeModulesEngineHost {
    return this._engineHost as NodeModulesEngineHost;
  }
}
