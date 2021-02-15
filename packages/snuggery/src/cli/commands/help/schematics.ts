import {Option} from 'clipanion';

import {SchematicCommand} from '../../command/schematic';
import {formatMarkdownish} from '../../utils/format';

export class HelpSchematicsCommand extends SchematicCommand {
  static paths = [['help', 'schematics']];

  static usage = SchematicCommand.Usage({
    category: 'Workspace information commands',
    description: 'Show information about schematic collection',
    examples: [
      [
        'Print information about `@schematics/angular`',
        '$0 help schematics @schematics/angular',
      ],
      [
        "Print information about the default collection (if unconfigured, that's `@schematics/angular`)",
        '$0 help schematics',
      ],
    ],
  });

  collectionName = Option.String({required: false});

  protected readonly dryRun = false; // abstract in SchematicCommand, of no use here
  protected readonly force = false; // abstract in SchematicCommand, of no use here
  protected readonly showFileChanges = false; // abstract in SchematicCommand, of no use here

  protected get root(): string {
    return this.workspace.basePath;
  }

  async execute(): Promise<void> {
    const {report, format} = this;

    const collectionName = this.collectionName ?? this.getDefaultCollection();
    const collection = this.getCollection(collectionName);

    report.reportInfo(
      formatMarkdownish(`Collection \`${collectionName}\`:`, {
        format,
        maxLineLength: Infinity,
      }),
    );
    report.reportSeparator();

    const prefix = this.collectionName != null ? `${this.collectionName}:` : '';

    for (const schematicName of collection.listSchematicNames()) {
      report.reportInfo(
        formatMarkdownish(`- \`${prefix}${schematicName}\``, {
          format,
          maxLineLength: Infinity,
        }),
      );

      const {description} = collection.createSchematic(
        schematicName,
        false,
      ).description;

      if (description) {
        report.reportInfo(
          formatMarkdownish(description, {
            format,
            indentation: 2,
          }),
        );
      }

      report.reportSeparator();
    }

    report.reportInfo(
      formatMarkdownish(
        `For more information about a specific schematic in \`${collectionName}\`, run`,
        {format},
      ),
    );
    report.reportInfo(
      `  $ sn help schematic ${collectionName}:<schematic name>`,
    );
    report.reportSeparator();
  }
}
