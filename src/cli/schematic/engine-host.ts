import type {RuleFactory} from '@angular-devkit/schematics';
import {
  FileSystemCollectionDesc,
  FileSystemSchematicDesc,
  NodeModulesEngineHost,
} from '@angular-devkit/schematics/tools';

import type {Context} from '../command/context';
import {makeGeneratorIntoSchematic, Generator} from '../utils/tao';

export class AtelierEngineHost extends NodeModulesEngineHost {
  constructor(private readonly context: Context, paths?: string[]) {
    super(paths);
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
