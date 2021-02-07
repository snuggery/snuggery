import {getSystemPath, normalize, schema} from '@angular-devkit/core';
import type {RuleFactory} from '@angular-devkit/schematics';
import {BuiltinTaskExecutor} from '@angular-devkit/schematics/tasks/node';
import {
  FileSystemCollectionDesc,
  FileSystemSchematicDesc,
  NodeModulesEngineHost,
  OptionTransform,
  validateOptionsWithSchema,
} from '@angular-devkit/schematics/tools';

import type {Context} from '../command/context';
import {makeGeneratorIntoSchematic, Generator} from '../utils/tao';

export class SnuggeryEngineHost extends NodeModulesEngineHost {
  private readonly context: Context;

  constructor(
    _root: string,
    {
      context,
      packageManager,
      resolvePaths,
      schemaValidation,
      optionTransforms,
      registry,
    }: {
      context: Context;
      packageManager?: string;
      resolvePaths?: string[];
      schemaValidation?: boolean;
      optionTransforms?: OptionTransform<object, object>[];
      registry: schema.SchemaRegistry;
    },
  ) {
    super(resolvePaths);

    this.context = context;
    const rootDirectory = getSystemPath(normalize(_root));

    this.registerTaskExecutor(BuiltinTaskExecutor.NodePackage, {
      allowPackageManagerOverride: true,
      packageManager: packageManager,
      rootDirectory,
    });
    this.registerTaskExecutor(BuiltinTaskExecutor.RepositoryInitializer, {
      rootDirectory,
    });
    this.registerTaskExecutor(BuiltinTaskExecutor.RunSchematic);
    this.registerTaskExecutor(BuiltinTaskExecutor.TslintFix);

    if (optionTransforms) {
      for (const transform of optionTransforms) {
        this.registerOptionsTransform(transform);
      }
    }

    if (schemaValidation) {
      this.registerOptionsTransform(validateOptionsWithSchema(registry));
    }
  }

  getSchematicRuleFactory<OptionT extends object>(
    schematic: FileSystemSchematicDesc,
    collection: FileSystemCollectionDesc,
  ): RuleFactory<OptionT> {
    if (schematic.schemaJson?.cli === 'nx') {
      return makeGeneratorIntoSchematic(
        (schematic.factoryFn as unknown) as Generator,
        this.context.workspace?.basePath ?? this.context.startCwd,
        this,
      ) as RuleFactory<OptionT>;
    }

    return super.getSchematicRuleFactory(schematic, collection);
  }
}
