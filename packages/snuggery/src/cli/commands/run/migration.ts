import type {FileSystemSchematic} from '@angular-devkit/schematics/tools';
import {Option, UsageError} from 'clipanion';
import {
  Range,
  compare as compareVersions,
  valid as validateSemVer,
  SemVer,
} from 'semver';

import {MigrationCollection, MigrationCommand} from '../../command/migration';
import {formatMarkdownish} from '../../utils/format';
import {isSemVer} from '../../utils/typanion';

export class RunMigrationCommand extends MigrationCommand {
  static paths = [['run', 'migration']];

  static usage = MigrationCommand.Usage({
    category: 'Schematic commands',
    description: 'Run migration(s) of a package',
    details: `
      This command migrates a package from an older version to the currently installed version by running schematics.

      There are two kinds of migrations:

      The most common kind of migration is a versioned migration. It is linked to the version of the package that introduced changes requiring the migration. You can run all migrations between two versions by passing the version you want to migrate from via \`--from\` and optionally the version you want to migrate to via \`--to\`. If no \`--to\` is passed, the currently installed version of the package will be used. Alternatively to running these migrations by specifying versions, you could run a single migration by passing its name to \`--name\`.
      
      The other kind is a migration not linked to a version. These can only be executed by passing in their name via \`--name\`.
      
      This command does not update the package itself, it only runs the registered migrations.
    `,
    examples: [
      [
        'Run all migrations in `@angular/material` between versions `10.0.2` (exclusive) and `11.0.0` (inclusive)',
        '$0 run migration @angular/material --from 10.0.2 --to 11.0.0',
      ],
      [
        'Run the `rename-browserslist-config` migration of the `@angular/cli` package',
        '$0 run migration @angular/cli --name rename-browserslist-config',
      ],
    ],
  });

  /**
   * Define the `help` option explicitly
   *
   * Clipanion by default logs a help statement if `<path> --help` or `<path> -h` is executed, but
   * it no longer does this when other parameters are present, e.g.
   *
   * ```bash
   * sn run migration --help # prints statement
   * sn run migration @angular/cli --help # prints error about unknown option --help
   * ```
   *
   * Most of our commands don't need this, because they proxy extra arguments into `parseOptions`,
   * which handles the `--help` properly. This migration command doesn't, so we have to provide the
   * functionality to ensure we don't confuse our users by having some commands allow adding
   * `--help` when arguments are present and some commands throwing errors if arguments are present
   * and `--help` is passed.
   */
  help = Option.Boolean('--help,-h', false, {hidden: true});

  dryRun = Option.Boolean('--dry-run', false, {
    description: 'Run the schematics without writing the results to disk',
  });

  force = Option.Boolean('--force', false, {
    description: 'Write the results to disk even if there are conflicts',
  });

  showFileChanges = Option.Boolean('--show-file-changes', false, {
    description: 'Print an overview of all file changes made by the schematic',
  });

  ignoreMissingMigrations = Option.Boolean(
    '--ignore-missing-migrations',
    false,
    {
      description:
        "Exit successfully if the package doesn't define any migrations",
    },
  );

  name = Option.String('--name', {
    description: 'Name of the migration to run',
  });

  from = Option.String('--from', {
    description: 'The version to migrate from',
    validator: isSemVer(),
  });

  to = Option.String('--to', {
    description: 'The version to migrate to, defaults to the installed version',
    validator: isSemVer(),
  });

  package = Option.String();

  async execute(): Promise<number | void> {
    const collection = this.getMigrationCollection(this.package);

    if (collection == null) {
      if (this.ignoreMissingMigrations) {
        this.report.reportWarning(
          `Package ${JSON.stringify(
            this.package,
          )} doesn't have migrations, not doing anything`,
        );
        return 0;
      }

      this.report.reportError(
        `Package ${JSON.stringify(this.package)} doesn't have migrations`,
      );
      this.report.reportDebug(
        formatMarkdownish(
          "Pass `--ignore-missing-migrations` to exit successfully if a package doesn't define upgrade schematics",
          {format: this.format},
        ),
      );

      return 1;
    }

    if (this.name && this.from) {
      throw new UsageError('Use only one of `--from` or `--name`');
    } else if (this.name) {
      return this.executeName(collection, this.name);
    } else if (this.from) {
      return this.executeFrom(collection, this.from);
    } else {
      throw new UsageError(
        'Add one of `--name` or `--from` to run migrations, add `--help` for more information',
      );
    }
  }

  private async executeName(collection: MigrationCollection, name: string) {
    return this.runSchematic({
      schematic: collection.createSchematic(name),
    });
  }

  private async executeFrom(collection: MigrationCollection, from: SemVer) {
    const toVersion =
      this.to?.format() ?? collection.version ?? collection.description.version;

    if (toVersion == null) {
      throw new UsageError(
        `Package ${JSON.stringify(
          this.package,
        )} doesn't define a version, specify the current version via --to`,
      );
    }

    const range = new Range(`> ${from.format()} <= ${toVersion}`, {
      includePrerelease: true,
    });

    const includedSchematics: {
      version: string;
      schematic: FileSystemSchematic;
    }[] = [];
    for (const schematicName of collection.listSchematicNames()) {
      const schematic = collection.createSchematic(schematicName);
      const version =
        schematic.description.version != null
          ? validateSemVer(schematic.description.version)
          : null;

      if (version == null || !range.test(version)) {
        continue;
      }

      includedSchematics.push({schematic, version});
    }

    if (includedSchematics.length === 0) {
      const message = formatMarkdownish(
        `There are no migrations in package \`${this.package}\` between versions \`${this.from}\` and \`${toVersion}\``,
        {format: this.format},
      );

      if (this.ignoreMissingMigrations) {
        this.report.reportInfo(message);

        return 0;
      }

      this.report.reportError(message);
      this.report.reportInfo(
        formatMarkdownish(
          "Pass `--ignore-missing-migrations` to exit successfully if a package doesn't define upgrade schematics",
          {format: this.format},
        ),
      );
      return 1;
    }

    includedSchematics.sort(
      (a, b) =>
        // Run versions in order
        compareVersions(a.version, b.version) ||
        // If multiple migration schematics are listed for a single version,
        // run these alphabetically
        a.schematic.description.name.localeCompare(
          b.schematic.description.name,
        ),
    );

    this.report.reportInfo(
      formatMarkdownish(
        `Running ${includedSchematics.length} migration${
          includedSchematics.length > 1 ? 's' : ''
        } in package  \`${this.package}\``,
        {
          format: this.format,
          maxLineLength: Infinity,
        },
      ),
    );

    for (const {schematic} of includedSchematics) {
      this.report.reportInfo(
        formatMarkdownish(
          `Running migration \`${schematic.description.name}\``,
          {format: this.format, maxLineLength: Infinity},
        ),
      );

      const result = await this.runSchematic({schematic});

      if (result !== 0) {
        return result;
      }
    }

    return 0;
  }
}
