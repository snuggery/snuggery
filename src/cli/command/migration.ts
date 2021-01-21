import {isJsonObject, JsonObject} from '@angular-devkit/core';
import type {Collection} from '@angular-devkit/schematics';
import type {
  FileSystemCollectionDescription,
  FileSystemSchematicDescription,
} from '@angular-devkit/schematics/tools';
import {Option, UsageError} from 'clipanion';
import {createRequire} from 'module';
import {join} from 'path';

import {SchematicCommand} from './schematic';

export class MigrationCollectionCannotBeResolvedError extends Error {
  readonly clipanion = {type: 'none'};
  name = 'MigrationCollectionCannotBeResolvedError';
}

export type MigrationCollection = Collection<
  FileSystemCollectionDescription,
  FileSystemSchematicDescription & {readonly version?: string}
> & {readonly version?: string};

export abstract class MigrationCommand extends SchematicCommand {
  /**
   * Define the `help` option explicitly
   *
   * Clipanion by default logs a help statement if `<path> --help` or `<path> -h` is executed, but
   * it no longer does this when other parameters are present, e.g.
   *
   * ```bash
   * ai run migration --help # prints statement
   * ai run migration @angular/cli --help # prints error about unknown option --help
   * ```
   *
   * Most of our commands don't need this, because they proxy extra arguments into `parseOptions`,
   * which handles the `--help` properly. Migration commands don't do this, so we have to provide
   * the functionality to ensure we don't confuse our users by having some commands allow adding
   * `--help` when arguments are present and some commands throwing errors if arguments are present
   * and `--help` is passed.
   */
  help = Option.Boolean('--help,-h', false);

  protected get root(): string {
    return this.workspace.basePath;
  }

  getMigrationCollection(pkgName: string): MigrationCollection | null {
    let pkgJsonPath: string;
    let pkgJson: JsonObject;
    const {root} = this; // explicitly do this outside of the try-catch in case it throws
    try {
      const require = createRequire(join(root, '<synthetic>'));
      pkgJsonPath = require.resolve(`${pkgName}/package.json`);
      pkgJson = require(`${pkgName}/package.json`);
    } catch {
      throw new UsageError(
        `Failed to find package ${JSON.stringify(
          pkgName,
        )} in the workspace root`,
      );
    }

    if (
      !isJsonObject(pkgJson['ng-update']!) ||
      typeof pkgJson['ng-update'].migrations !== 'string'
    ) {
      return null;
    }

    const migrationRequire = createRequire(pkgJsonPath);

    let migrationJsonPath: string;
    try {
      migrationJsonPath = migrationRequire.resolve(
        `./${pkgJson['ng-update'].migrations}`,
      );
    } catch {
      try {
        migrationJsonPath = migrationRequire.resolve(
          pkgJson['ng-update'].migrations,
        );
      } catch {
        throw new MigrationCollectionCannotBeResolvedError(
          `Couldn't find ${JSON.stringify(
            pkgJson['ng-update'].migrations,
          )} in package "${pkgName}"`,
        );
      }
    }

    const collection = this.getCollection(migrationJsonPath);

    if (typeof pkgJson.version === 'string') {
      return Object.assign(collection, {version: pkgJson.version});
    }

    return collection;
  }
}
