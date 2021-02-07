import {Option} from 'clipanion';

import {MigrationCommand} from '../../command/migration';
import {formatMarkdownish} from '../../utils/format';

export class HelpMigrationsCommand extends MigrationCommand {
  static paths = [['help', 'migrations']];

  static usage = MigrationCommand.Usage({
    category: 'Workspace information commands',
    description: 'Show information about migrations for a package',
    examples: [
      [
        'Print information about the migrations in `@schematics/angular`',
        '$0 help migrations @schematics/angular',
      ],
    ],
  });

  package = Option.String();

  protected readonly dryRun = false; // abstract in SchematicCommand, of no use here
  protected readonly force = false; // abstract in SchematicCommand, of no use here
  protected readonly showFileChanges = false; // abstract in SchematicCommand, of no use here

  protected get root(): string {
    return this.workspace.basePath;
  }

  async execute(): Promise<void> {
    const {report, format} = this;

    const collection = this.getMigrationCollection(this.package);

    if (collection == null) {
      report.reportInfo(
        formatMarkdownish(
          `Package \`${this.package}\` doesn't have any migrations.`,
          {format, paragraphs: true},
        ),
      );
      return;
    }

    const currentVersion = collection.version ?? collection.description.version;
    report.reportInfo(
      formatMarkdownish(
        `Migrations for \`${this.package}\` (${
          currentVersion
            ? `currently at \`${currentVersion}\``
            : 'version number not found'
        }):`,
        {
          format,
          paragraphs: false,
        },
      ),
    );
    report.reportSeparator();

    for (const schematicName of collection.listSchematicNames()) {
      report.reportInfo(
        formatMarkdownish(`- \`${schematicName}\``, {
          format,
          paragraphs: false,
        }),
      );

      const {version} = collection.createSchematic(
        schematicName,
        false,
      ).description;

      report.reportInfo(
        formatMarkdownish(
          version ? `Version \`${version}\`` : 'Not linked to a version',
          {
            format,
            paragraphs: false,
            indentation: 2,
          },
        ),
      );

      report.reportSeparator();
    }
  }
}
