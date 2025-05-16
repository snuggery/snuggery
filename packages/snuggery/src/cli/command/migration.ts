import type {Collection} from "@angular-devkit/schematics";
import {isJsonObject, type JsonObject} from "@snuggery/core";
import {UsageError} from "clipanion";
import {createRequire} from "module";
import {join} from "path";

import {AbstractError} from "../../utils/error.js";
import type {
	SnuggeryCollectionDescription,
	SnuggerySchematic,
	SnuggerySchematicDescription,
} from "../schematic/engine-host.js";

import {SchematicCommand} from "./schematic.js";

export class MigrationCollectionCannotBeResolvedError extends AbstractError {}

export type MigrationCollection = Collection<
	SnuggeryCollectionDescription,
	SnuggerySchematicDescription & {readonly version?: string}
> & {readonly version?: string};

export abstract class MigrationCommand extends SchematicCommand {
	protected get root(): string {
		return this.workspace.workspaceFolder;
	}

	protected async getMigrationCollection(
		pkgName: string,
	): Promise<MigrationCollection | null> {
		let pkgJsonPath: string;
		let pkgJson: JsonObject;
		const {root} = this; // explicitly do this outside of the try-catch in case it throws
		try {
			const require = createRequire(join(root, "<synthetic>"));
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
			!isJsonObject(pkgJson["ng-update"]) ||
			typeof pkgJson["ng-update"].migrations !== "string"
		) {
			return null;
		}

		const migrationRequire = createRequire(pkgJsonPath);

		let migrationJsonPath: string;
		try {
			migrationJsonPath = migrationRequire.resolve(
				`./${pkgJson["ng-update"].migrations}`,
			);
		} catch {
			try {
				migrationJsonPath = migrationRequire.resolve(
					pkgJson["ng-update"].migrations,
				);
			} catch {
				throw new MigrationCollectionCannotBeResolvedError(
					`Couldn't find ${JSON.stringify(
						pkgJson["ng-update"].migrations,
					)} in package "${pkgName}"`,
				);
			}
		}

		const collection = await this.getCollection(migrationJsonPath);

		if (typeof pkgJson.version === "string") {
			return Object.assign(collection, {version: pkgJson.version});
		}

		return collection;
	}

	protected async getMigrationsInRange(
		collection: MigrationCollection,
		from: string,
		to: string,
	): Promise<
		{
			version: string;
			schematic: SnuggerySchematic;
		}[]
	> {
		const [{default: Range}, {default: valid}, {default: compare}] =
			await Promise.all([
				import("semver/classes/range.js"),
				import("semver/functions/valid.js"),
				import("semver/functions/compare.js"),
			]);
		const range = new Range(`> ${from} <= ${to}`, {
			includePrerelease: true,
		});
		const includedSchematics: Awaited<
			ReturnType<MigrationCommand["getMigrationsInRange"]>
		> = [];

		for (const schematicName of collection.listSchematicNames()) {
			const schematic = collection.createSchematic(schematicName);
			const version =
				schematic.description.version != null ?
					valid(schematic.description.version)
				:	null;

			if (version == null || !range.test(version)) {
				continue;
			}

			includedSchematics.push({schematic, version});
		}

		includedSchematics.sort(
			(a, b) =>
				// Run versions in order
				compare(a.version, b.version) ||
				// If multiple migration schematics are listed for a single version,
				// run these alphabetically
				a.schematic.description.name.localeCompare(
					b.schematic.description.name,
				),
		);

		return includedSchematics;
	}
}
