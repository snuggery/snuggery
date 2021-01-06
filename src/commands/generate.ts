import type {JsonObject} from '@angular-devkit/core';
import {UsageError} from 'clipanion';

import {
  dryRunOption,
  forceOption,
  reservedNames,
  SchematicCommand,
} from '../command/schematic';
import {parseFreeFormArguments, parseOptions} from '../utils/parse-options';

export class GenerateCommand extends SchematicCommand {
  static usage = SchematicCommand.Usage({
    category: 'Schematic commands',
    description: 'Generate and/or modify files based on a schematic',
    examples: [
      [
        'Run the `component` schematic of the `@schematics/angular` package',
        '$0 generate @schematics/angular:component',
      ],
      [
        "Dry-run the `application` schematic of the default schematic package (if not configured, that's `@schematics/angular`)",
        '$0 generate --dry-run application',
      ],
    ],
  });

  @SchematicCommand.Boolean('--dry-run', {
    description: 'Run the schematics without writing the results to disk',
  })
  public dryRun = false;

  @SchematicCommand.Boolean('--force', {
    description: 'Write the results to disk even if there are conflicts',
  })
  public force = false;

  @SchematicCommand.String()
  public schematic?: string;

  @SchematicCommand.Proxy()
  public args: string[] = [];

  protected get root(): string {
    return this.workspace.basePath;
  }

  @SchematicCommand.Path('g')
  @SchematicCommand.Path('generate')
  async execute(): Promise<number | void> {
    if (this.schematic == null) {
      throw new UsageError('Missing schematic to run');
    }

    let collectionName, schematicName;
    if (this.schematic.includes(':')) {
      [collectionName, schematicName] = this.schematic.split(':', 2) as [
        string,
        string,
      ];
    } else {
      collectionName = this.getDefaultCollection();
      schematicName = this.schematic;
    }

    const schematic = this.getSchematic(
      this.getCollection(collectionName),
      schematicName,
      false,
    );

    const {
      options: definedOptions,
      allowExtraOptions,
      description,
    } = await this.getOptions(schematic);

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
        path: [...this.path, this.schematic],
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
