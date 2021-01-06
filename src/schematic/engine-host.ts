import {RuleFactory} from '@angular-devkit/schematics';
import {
  FileSystemCollectionDesc,
  FileSystemSchematicDesc,
  NodeModulesEngineHost,
} from '@angular-devkit/schematics/tools';

import {Context} from '../command/context';
import {makeGeneratorInfoSchematic} from '../utils/tao';

export class AtelierEngineHost extends NodeModulesEngineHost {
  constructor(private readonly context: Context, paths?: string[]) {
    super(paths);
  }

  getSchematicRuleFactory<OptionT extends object>(
    schematic: FileSystemSchematicDesc,
    collection: FileSystemCollectionDesc,
  ): RuleFactory<OptionT> {
    if (schematic.schemaJson?.cli === 'nx') {
      return makeGeneratorInfoSchematic(
        schematic.factoryFn as any,
        this.context.workspace?.basePath ?? this.context.startCwd,
        this,
      ) as RuleFactory<OptionT>;
    }

    return super.getSchematicRuleFactory(schematic, collection);
  }
}
