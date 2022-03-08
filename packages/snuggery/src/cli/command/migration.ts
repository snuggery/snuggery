import {isJsonObject, JsonObject} from '@angular-devkit/core';
import type {Collection} from '@angular-devkit/schematics';
import type {
	FileSystemCollectionDescription,
	FileSystemSchematic,
	FileSystemSchematicDescription,
} from '@angular-devkit/schematics/tools';
import {ErrorWithMeta, UsageError} from 'clipanion';
import {createRequire} from 'module';
import {join} from 'path';
import {
	Range,
	valid as validateSemVer,
	compare as compareVersions,
} from 'semver';

import {SchematicCommand} from './schematic';

export class MigrationCollectionCannotBeResolvedError
	extends Error
	implements ErrorWithMeta
{
	readonly clipanion = {type: 'none'} as const;
	override name = 'MigrationCollectionCannotBeResolvedError';
}

export type MigrationCollection = Collection<
	FileSystemCollectionDescription,
	FileSystemSchematicDescription & {readonly version?: string}
> & {readonly version?: string};

export abstract class MigrationCommand extends SchematicCommand {
	protected get root(): string {
		return this.workspace.basePath;
	}

	protected getMigrationCollection(
		pkgName: string,
	): MigrationCollection | null {
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

	protected getMigrationsInRange(
		collection: MigrationCollection,
		from: string,
		to: string,
	): {
		version: string;
		schematic: FileSystemSchematic;
	}[] {
		const range = new Range(`> ${from} <= ${to}`, {
			includePrerelease: true,
		});
		const includedSchematics: ReturnType<
			MigrationCommand['getMigrationsInRange']
		> = [];

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

		return includedSchematics;
	}
}
