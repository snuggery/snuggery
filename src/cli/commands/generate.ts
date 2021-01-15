import {Option} from 'clipanion';

import {
  dryRunOption,
  forceOption,
  SchematicCommand,
} from '../command/schematic';

const reservedNames = new Set(['--show-file-changes']);

export class GenerateCommand extends SchematicCommand {
  static paths = [['generate'], ['g']];

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

  dryRun = Option.Boolean('--dry-run', false, {
    description: 'Run the schematics without writing the results to disk',
  });

  force = Option.Boolean('--force', false, {
    description: 'Write the results to disk even if there are conflicts',
  });

  showFileChanges = Option.Boolean('--show-file-changes', false, {
    description: 'Print an overview of all file changes made by the schematic',
  });

  schematic = Option.String();

  args = Option.Proxy();

  protected get root(): string {
    return this.workspace.basePath;
  }

  async execute(): Promise<number | void> {
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

    const options = this.parseOptionValues({
      options: definedOptions,
      allowExtraOptions,
      description,

      commandOptions: [dryRunOption, forceOption],
      pathSuffix: [this.schematic],
      values: this.args,
      reservedNames,
    });

    if (options == null) {
      return 1;
    }

    if (options?.force != null) {
      this.force = !!options.force;
      delete options.force;
    }
    if (options?.dryRun != null) {
      this.dryRun = !!options.dryRun;
      delete options.dryRun;
    }

    return this.runSchematic({
      schematic,
      options: {
        ...this.createPathPartialOptions(definedOptions),
        ...options,
      },
    });
  }
}
