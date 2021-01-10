import type {JsonObject} from '@angular-devkit/core';

import {
  dryRunOption,
  forceOption,
  SchematicCommand,
} from '../command/schematic';
import {parseFreeFormArguments, parseOptions} from '../utils/parse-options';

const reservedNames = new Set(['--show-file-changes']);

export class NewCommand extends SchematicCommand {
  static usage = SchematicCommand.Usage({
    category: 'Schematic commands',
    description: 'Create a new workspace',
    examples: [['Create a new workspace ', '$0 new @schematics/angular']],
  });

  @SchematicCommand.Boolean('--dry-run', {
    description: 'Run the schematics without writing the results to disk',
  })
  dryRun = false;

  @SchematicCommand.Boolean('--force', {
    description: 'Write the results to disk even if there are conflicts',
  })
  force = false;

  @SchematicCommand.Boolean('--show-file-changes', {
    description: 'Print an overview of all file changes made by the schematic',
  })
  showFileChanges = false;

  @SchematicCommand.String()
  collection!: string;

  @SchematicCommand.Proxy()
  args: string[] = [];

  protected get root(): string {
    return this.context.startCwd;
  }

  protected readonly resolveSelf = true;

  @SchematicCommand.Path('new')
  async execute(): Promise<number | void> {
    const schematic = this.getSchematic(
      this.getCollection(this.collection),
      'ng-new',
      true,
    );

    const {
      options: definedOptions,
      allowExtraOptions,
      description,
    } = await this.getOptions(schematic);

    /* eslint-disable @typescript-eslint/no-var-requires */
    this.workflow.registry.addSmartDefaultProvider(
      'ng-cli-version',
      () => require('@angular-devkit/core/package.json').version,
    );
    this.workflow.registry.addSmartDefaultProvider(
      'atelier-version',
      () => require('@bgotink/atelier/package.json').version,
    );
    /* eslint-enable @typescript-eslint/no-var-requires */

    let options: JsonObject | undefined;
    if (definedOptions.length === 0) {
      if (allowExtraOptions) {
        options = parseFreeFormArguments(this.args);
      }
    } else {
      const o = parseOptions({
        command: this,
        description,
        options: [dryRunOption, forceOption, ...definedOptions],
        path: [...this.path, this.collection],
        values: this.args,
        reservedNames,
      });

      if (o === null) {
        return 1;
      }

      options = {
        ...this.createPathPartialOptions(definedOptions),
        ...o,
      };
    }

    if (options?.force != null) {
      this.force = !!options.force;
      delete options.force;
    }
    if (options?.dryRun != null) {
      this.dryRun = !!options.dryRun;
      delete options.dryRun;
    }

    return this.runSchematic({schematic, options});
  }
}
