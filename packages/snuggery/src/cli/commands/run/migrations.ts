import {tags} from '@angular-devkit/core';
import {Option, UsageError} from 'clipanion';
import {promises as fs} from 'fs';
import JSON5 from 'json5';
import {resolve} from 'path';
import {SemVer} from 'semver';
import * as t from 'typanion';

import {MigrationCommand} from '../../command/migration';
import {formatMarkdownish} from '../../utils/format';
import * as tExt from '../../utils/typanion';

interface Migration {
  package: string;
  from: SemVer;
  to: SemVer;

  skip?: boolean;

  skippedMigrations?: string[];
}

const validateMigrationFile: t.StrictValidator<unknown, Migration[]> =
  t.isArray(
    t.isObject({
      package: t.isString(),
      from: tExt.isSemVer(),
      to: tExt.isSemVer(),

      skip: t.isOptional(t.isBoolean()),

      skippedMigrations: t.isOptional(t.isArray(t.isString())),
    }),
  );

export const defaultMigrationFilename = 'migrations.json';

export class RunMigrationsCommand extends MigrationCommand {
  static paths = [['run', 'migrations']];

  static usage = MigrationCommand.Usage({
    category: 'Update commands',
    description: 'Run registered migrations',
    details: `
      TODO
    `,
    examples: [
      ['Prepare the migrations file for review', '$0 run migrations --prepare'],
      [
        'Run all migrations registered in previous `$0 run update` executions',
        '$0 run migrations',
      ],
      [
        'Run all migrations registered in the `other-migrations.json` file',
        '$0 run migrations other-migrations.json',
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

  prepare = Option.Boolean('--prepare', false, {
    description: 'Prepare the migrations file',
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

  ignoreMissingMigrations = Option.Boolean(
    '--ignore-missing-migrations',
    false,
    {
      description:
        "Exit successfully if the package doesn't define any migrations",
    },
  );

  filenameOverride = Option.String({
    name: 'file',
    required: false,
  });

  protected get filename(): string {
    return this.filenameOverride ?? defaultMigrationFilename;
  }

  private get filePath(): string {
    return resolve(this.root, this.filename);
  }

  async execute(): Promise<number | void> {
    // Always make this command run as if it was executed in the workspace root
    this.context.startCwd = this.root;

    const migrationFile = JSON5.parse(
      await fs.readFile(this.filePath, 'utf8'),
    ) as unknown;

    {
      const errors: string[] = [];
      const coercions: t.Coercion[] = [];

      if (!validateMigrationFile(migrationFile, {errors, coercions})) {
        if (errors.length === 1) {
          throw new UsageError(`Invalid migration file: ${errors[0]}`);
        } else {
          throw new UsageError(
            `Invalid migration file:\n\n- ${errors.join('\n- ')}`,
          );
        }
      }

      for (const [, op] of coercions) {
        op();
      }
    }

    if (this.prepare) {
      return this.writeMigrationFile(
        await this.prepareMigrations(migrationFile),
        true,
      );
    } else {
      return this.executeMigrations(migrationFile);
    }
  }

  private writeMigrationFile(migrationFile: Migration[], log = false) {
    if (migrationFile.length === 0) {
      if (log) {
        this.report.reportInfo(`No migrations are required`);
      }
      return fs.rm(this.filePath, {force: true});
    }

    if (log) {
      this.report.reportInfo(
        `Take a look at ${this.filename} to see what migrations are ready to be executed`,
      );
    }
    return fs.writeFile(
      this.filePath,
      tags.stripIndent`
        /**
         * This file contains migrations to execute via \`sn run migrations\`.
         *
         * Every item in the array is a package for which to execute migrations. Every package has
         * the following properties:
         * - 'package': the name of the package
         * - 'from': the version of the package that you're migrating from
         * - 'to': the version of the package that you're migrating to
         * - 'skip': optional boolean to indicate this migration has to be skipped in its entirety
         * - 'skippedMigrations': names of specific migration schematics to skip
         *
         * After execution, this file is cleaned up automatically. Skipped migrations are left
         * untouched to help with running migrations in parts rather than as one "big bang".
         *
         * If anything would go wrong during the migrations, this file will be updated to reflect
         * which migrations have already been executed.
         *
         * Run \`sn help update\` for more information on the update process, or
         * \`sn run migrations${
           this.filenameOverride ? ` ${this.filenameOverride}` : ''
         }\` to execute the configured migrations.
         */
        ` +
        '\n' +
        JSON.stringify(
          migrationFile,
          (_, value) => (value instanceof SemVer ? value.format() : value),
          '\t',
        ),
    );
  }

  private async prepareMigrations(
    migrationFile: Migration[],
  ): Promise<Migration[]> {
    const newMigrationFile: Migration[] = [];

    for (const migration of migrationFile) {
      const collection = this.getMigrationCollection(migration.package);

      if (collection == null) {
        continue;
      }

      const includedSchematics = this.getMigrationsInRange(
        collection,
        migration.from.format(),
        migration.to.format(),
      );

      if (includedSchematics.length === 0) {
        continue;
      }

      migration.skippedMigrations ??= [];

      const migrationNames = new Set(
        includedSchematics.map(mig => mig.schematic.description.name),
      );

      migration.skippedMigrations = migration.skippedMigrations.filter(name =>
        migrationNames.has(name),
      );

      newMigrationFile.push(migration);
    }

    return newMigrationFile;
  }

  private async executeMigrations(migrationFile: Migration[]): Promise<number> {
    if (!migrationFile.length) {
      this.report.reportInfo(`The migration file is empty, nothing to do.`);
      await this.writeMigrationFile(migrationFile);
      return 0;
    }

    migrationFile = await this.prepareMigrations(migrationFile);

    if (!migrationFile.length) {
      this.report.reportInfo(
        `The migration file didn't contain any packages with actual migrations, nothing to do.`,
      );
      await this.writeMigrationFile(migrationFile);
      return 0;
    }

    const newMigrationFile: Migration[] = [];
    let lastExecutedIndex = 0;
    let hasExecutedSomething = false;

    try {
      for (const migration of migrationFile) {
        if (migration.skip) {
          newMigrationFile.push(migration);
          lastExecutedIndex++;
          continue;
        }

        const migrationResult = await this.executeMigration(migration);

        if (migrationResult != null) {
          hasExecutedSomething = true;
        }

        if (migrationResult) {
          this.report.reportInfo(
            'All successfully executed migrations have been removed from the migrations file, so you can pick up where it went wrong by executing this command again',
          );
          return migrationResult;
        }

        lastExecutedIndex++;
        if (migration.skippedMigrations?.length) {
          newMigrationFile.push({
            ...migration,
            skip: true,
          });
        }
      }

      if (!hasExecutedSomething) {
        this.report.reportInfo(
          'All migrations have been skipped, nothing to do.',
        );
      }

      return 0;
    } finally {
      await this.writeMigrationFile([
        ...newMigrationFile,
        ...migrationFile.slice(lastExecutedIndex),
      ]);
    }
  }

  private async executeMigration(migration: Migration) {
    const collection = this.getMigrationCollection(migration.package);

    if (collection == null) {
      this.report.reportError(
        `Package ${JSON.stringify(migration.package)} doesn't have migrations`,
      );

      return 1;
    }

    const migrationsInRange = this.getMigrationsInRange(
      collection,
      migration.from.format(),
      migration.to.format(),
    );

    if (migrationsInRange.length === 0) {
      this.report.reportError(
        formatMarkdownish(
          `There are no migrations in package \`${
            migration.package
          }\` between versions \`${migration.from.format()}\` and \`${migration.to.format()}\``,
          {format: this.format},
        ),
      );

      return 1;
    }

    const skippedMigrations = new Set(migration.skippedMigrations);
    const migrationsToExecute = migrationsInRange.filter(
      ({schematic}) => !skippedMigrations.has(schematic.description.name),
    );

    if (migrationsToExecute.length === 0) {
      this.report.reportWarning(
        `All migrations of package ${
          migration.package
        } between ${migration.from.format()} and ${migration.to.format()} have been skipped`,
      );
      return null;
    }

    this.report.reportInfo(
      formatMarkdownish(
        `Running ${migrationsToExecute.length} migration${
          migrationsToExecute.length > 1 ? 's' : ''
        } in package  \`${migration.package}\``,
        {
          format: this.format,
          maxLineLength: Infinity,
        },
      ),
    );

    const executed = new Set<string>();

    for (const {schematic} of migrationsToExecute) {
      this.report.reportInfo(
        formatMarkdownish(
          `Running migration \`${schematic.description.name}\``,
          {format: this.format, maxLineLength: Infinity},
        ),
      );

      const result = await this.runSchematic({schematic});

      if (result !== 0) {
        // Add the executed schematics to skippedMigrations to make the command resumable
        migration.skippedMigrations = migrationsInRange
          .map(({schematic}) => schematic.description.name)
          .filter(name => executed.has(name) || skippedMigrations.has(name));

        return result;
      }

      executed.add(schematic.description.name);
    }

    return 0;
  }
}
