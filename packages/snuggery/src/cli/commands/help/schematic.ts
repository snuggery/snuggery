import {Option} from 'clipanion';

import {SchematicCommand} from '../../command/schematic';
import {formatMarkdownish} from '../../utils/format';
import {printSchema} from '../../utils/print-schema';

export class HelpSchematicCommand extends SchematicCommand {
  static paths = [['help', 'schematic']];

  static usage = SchematicCommand.Usage({
    category: 'Workspace information commands',
    description: 'Show information about a schematic',
    examples: [
      [
        'Print information about `@schematics/angular:component`',
        '$0 help schematic @schematics/angular:component',
      ],
      [
        'Print information about the `service` schematic of the default collection',
        '$0 help schematic service',
      ],
    ],
  });

  schematic = Option.String();

  protected readonly dryRun = false; // abstract in SchematicCommand, of no use here
  protected readonly force = false; // abstract in SchematicCommand, of no use here
  protected readonly showFileChanges = false; // abstract in SchematicCommand, of no use here

  protected get root(): string {
    return this.workspace.basePath;
  }

  async execute(): Promise<void> {
    const {report, format} = this;

    const {collectionName, schematicName} = this.resolveSchematic(
      this.schematic,
    );

    const {
      description: {description, schemaJson},
    } = this.getSchematic(collectionName, schematicName, false);

    report.reportInfo(
      formatMarkdownish(
        `Schematic \`${schematicName}\` of collection \`${collectionName}\``,
        {format, maxLineLength: Infinity},
      ),
    );
    report.reportSeparator();

    if (description) {
      report.reportInfo(formatMarkdownish(description, {format}));
      report.reportSeparator();
    }

    report.reportInfo(`${format.header('Properties:')}\n`);

    if (schemaJson == null) {
      report.reportInfo(`This builder doesn't accept any properties.\n`);
      return;
    }

    printSchema(schemaJson, {
      report,
      format,
      supportPathFormat: true,
    });
  }
}
