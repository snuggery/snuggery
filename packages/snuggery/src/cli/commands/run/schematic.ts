import {Option} from 'clipanion';

import {SchematicCommand} from '../../command/schematic';

export class RunSchematicCommand extends SchematicCommand {
  static paths = [['run', 'schematic']];

  static usage = SchematicCommand.Usage({
    category: 'Schematic commands',
    description: 'Run a schematic to generate and/or modify files',
    details: `
      A schematic is a code generator that supports complex logic. It contains instructions and templates for creating or modifying your codebase.

      Schematics are published as npm packages called collections. A schematic is reference uniquely by defining both the collection's name and the schematic's name: \`<collection>:<schematic>\`, e.g. \`@schematics/angular:component\`. A workspace has a default collection, those schematics can be referenced simply by their name. If no default collection is configured, \`@schematics/angular\` is the default collection.

      This command accepts options and schematics usually also support options. The order in which your provide these options is important. The options of the Snuggery command (\`--dry-run\`, \`--force\` and \`--show-file-changes\`) must come before the name of the schematic. Any option passed after the schematic's identifier are considered options for the schematic itself.

      To get a list of available options for a schematic, run \`sn run schematic <schematic> --help\`.
    `,
    examples: [
      [
        'Run the `component` schematic of the `@schematics/angular` package',
        '$0 run schematic @schematics/angular:component',
      ],
      [
        "Dry-run the `application` schematic of the default schematic package (if not configured, that's `@schematics/angular`)",
        '$0 run schematic --dry-run application',
      ],
      [
        'Show all available command line options for the `@nrwl/react:application` schematic',
        '$0 run schematic @nrwl/react:application --help',
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
    const {collectionName, schematicName} = this.resolveSchematic(
      this.schematic,
    );

    const schematic = this.getSchematic(collectionName, schematicName, false);

    const {
      options: definedOptions,
      allowExtraOptions,
      description,
    } = await this.getOptions(schematic);

    return this.withOptionValues(
      {
        options: definedOptions,
        allowExtraOptions,
        description,

        pathSuffix: [this.schematic],
        values: this.args,
      },
      options =>
        this.runSchematic({
          schematic,
          options: {
            ...this.createPathPartialOptions(definedOptions),
            ...options,
          },
        }),
    );
  }
}
