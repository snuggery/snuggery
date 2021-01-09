import {SchematicCommand} from '../../command/schematic';
import {formatMarkdownish} from '../../utils/format';
import {printSchema} from '../../utils/print-schema';

export class HelpSchematicCommand extends SchematicCommand {
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

  @SchematicCommand.String()
  schematic!: string;

  readonly dryRun = false; // abstract in SchematicCommand, of no use here
  readonly force = false; // abstract in SchematicCommand, of no use here
  readonly showFileChanges = false; // abstract in SchematicCommand, of no use here

  protected get root(): string {
    return this.workspace.basePath;
  }

  @SchematicCommand.Path('help', 'schematic')
  async execute(): Promise<void> {
    const {report, format} = this;

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

    const {
      description: {description, schemaJson},
    } = this.getSchematic(
      this.getCollection(collectionName),
      schematicName,
      false,
    );

    report.reportInfo(
      formatMarkdownish(
        `Schematic \`${schematicName}\` of collection \`${collectionName}\``,
        {format, paragraphs: false},
      ),
    );
    report.reportSeparator();

    if (description) {
      report.reportInfo(
        formatMarkdownish(description, {format, paragraphs: true}),
      );
      report.reportSeparator();
    }

    report.reportInfo(`${format.bold('Properties:')}\n`);

    if (schemaJson == null) {
      report.reportInfo(`This builder doens't accept any properties.\n`);
      return;
    }

    printSchema(await this.workflow.registry.flatten(schemaJson).toPromise(), {
      report,
      format,
      supportPathFormat: true,
    });
  }
}
