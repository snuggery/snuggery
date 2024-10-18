/**
 * @fileoverview
 *
 * The SnuggeryArchitectHost is a re-implementation of the WorkspaceNodeModulesArchitectHost
 * that throws different types of errors (like angular does do in the schematic workflow) and
 * supports Tao-style executors
 */

import type {
	Target,
	BuilderInfo,
	createBuilder,
} from "@angular-devkit/architect";
// It would be great if we could have access to these without going through `/src/internal/`.
import type {
	ArchitectHost,
	Builder,
	BuilderSymbol as AngularBuilderSymbol,
} from "@angular-devkit/architect/src/internal.js";
import {
	isJsonObject,
	type JsonObject,
	type JsonValue,
	type ProjectDefinition,
	type TargetDefinition,
} from "@snuggery/core";
import {readFile} from "node:fs/promises";
import {dirname, join} from "node:path";

import type {Context} from "../command/context.js";
import {dynamicImport} from "../utils/dynamic-import.js";
import type {Executor} from "../utils/tao.js";

import {InvalidBuilderError, InvalidBuilderSpecifiedError} from "./errors.js";

export {Builder};

// Would be useful if angular exported this, but using `Symbol.for()` we are guaranteed
// to get the same symbol & this is not something they can change without making that a
// huge breaking change, so we're good.
const BuilderSymbol = Symbol.for("@angular-devkit/architect:builder") as symbol;

export function isBuilder(value: object): value is Builder {
	return (
		BuilderSymbol in value &&
		(value as Builder)[BuilderSymbol as typeof AngularBuilderSymbol]
	);
}

export interface SnuggeryBuilderInfo extends BuilderInfo {
	/**
	 * Package or builder JSON path the builder was loaded from
	 *
	 * If this is null, the builder was referenced directly (via `$direct:path/to/builder`).
	 */
	packageName: string | null;

	/**
	 * Absolute path to the builder implementation
	 */
	implementationPath: string;

	/**
	 * Key the builder is exported as, default export if `null`
	 */
	implementationExport: string | null;

	/**
	 * Whether the builder is a Tao executor rather than an Angular devkit builder
	 *
	 * If this is `true`, it's definitely a Tao executor.
	 * If this is `false`, it's definitely an Angular devkit builder.
	 * Otherwise, it might be an executor.
	 */
	isNx: boolean | null;
}

export interface ResolverFacade {
	/**
	 * Load the configuration for builders in the given package
	 *
	 * @param packageName Name of the builder package to load
	 * @throws If the builder cannot be found, cannot be loaded, is invalid, etc.
	 */
	loadBuilders(
		packageName: string,
	): Promise<
		[
			path: string,
			builders: Record<string, JsonValue>,
			executors?: Record<string, JsonValue>,
		]
	>;

	/**
	 * Resolve a single builder out of a builders configuration file
	 *
	 * @param packageName Package name (or path to a builders.json) to resolve the builder from
	 * @param builderName Name of the builder to resolve
	 * @throws If the builder cannot be found, cannot be loaded, is invalid, etc.
	 */
	resolveBuilder(
		packageName: string,
		builderName: string,
	): Promise<
		[builderPath: string, builderInfo: JsonValue, isNx: boolean | null]
	>;

	/**
	 * Resolve a single builder directly from path
	 *
	 * @param path The path to load the builder from
	 * @throws If the builder cannot be found, cannot be loaded, is invalid, etc.
	 */
	resolveDirectBuilder(path: string): Promise<[path: string, info: JsonObject]>;
}

export interface WorkspaceFacade {
	/**
	 * Directory the workspace is in
	 */
	readonly workspaceFolder?: string;

	/**
	 * Returns the project for the given name
	 *
	 * @param projectName The name of the project
	 * @throws if the given project name is not found or it's invalid
	 */
	getProject(projectName: string): ProjectDefinition;

	/**
	 * Returns metadata for the project with the given name
	 *
	 * @param projectName The name of the project
	 * @throws if the given project name is not found or it's invalid
	 */
	getProjectMetadata(projectName: string): JsonObject;

	/**
	 * Returns the given target configuration
	 *
	 * @param target The target to look up
	 * @throws if the given target is not found or it's invalid
	 */
	getTarget(target: Target): TargetDefinition;

	/**
	 * Returns the options configured for the given target
	 *
	 * @param target The target to look up
	 * @throws if the given target is not found or it's invalid
	 */
	getOptionsForTarget(target: Target): JsonObject | null;

	/**
	 * Convert the given executor into a builder that can be executed using the angular devkit
	 *
	 * @param executor The executor to convert
	 */
	convertExecutorIntoBuilder(
		executor: Executor,
	): ReturnType<typeof createBuilder>;
}

/**
 * An architect host supporting angular-style builders and tao-style executors
 */
export class SnuggeryArchitectHost
	implements ArchitectHost<SnuggeryBuilderInfo>
{
	readonly #context: Pick<Context, "startCwd">;
	readonly #resolver: ResolverFacade;
	readonly #workspace: WorkspaceFacade;
	constructor(
		context: Pick<Context, "startCwd">,
		resolver: ResolverFacade,
		workspace: WorkspaceFacade,
	) {
		this.#context = context;
		this.#resolver = resolver;
		this.#workspace = workspace;
	}

	/** @override */
	async getBuilderNameForTarget(target: Target): Promise<string> {
		return this.#workspace.getTarget(target).builder;
	}

	async listBuilders(
		packageName: string,
	): Promise<{name: string; description?: string}[]> {
		const [, builderJson, executorsJson] =
			await this.#resolver.loadBuilders(packageName);

		const names = new Set([
			...Object.keys(builderJson),
			...Object.keys(executorsJson || {}),
		]);

		return Array.from(names, (name) => {
			const builder = builderJson[name] ?? executorsJson?.[name];
			const description =
				typeof builder === "string"
					? `Alias for ${builder}`
					: isJsonObject(builder)
					? builder.description
					: null;

			if (typeof description === "string") {
				return {name, description};
			} else {
				return {name};
			}
		});
	}

	/** @override */
	async resolveBuilder(
		builderSpec: string,
		seenBuilders?: Set<string>,
	): Promise<SnuggeryBuilderInfo> {
		if (seenBuilders?.has(builderSpec)) {
			throw new InvalidBuilderError(
				`Detected cycle in builder aliases: ${Array.from(seenBuilders).join(
					" -> ",
				)} -> ${builderSpec}`,
			);
		}

		const [packageName, builderName] = builderSpec.split(":", 2) as [
			string,
			string | undefined,
		];

		if (builderName == null) {
			throw new InvalidBuilderSpecifiedError(
				`Builders must list a collection, use $direct as collection if you want to use a builder directly`,
			);
		}

		let builderPath: string;
		let builderInfo: JsonValue;
		let isNx: boolean | null = null;

		if (packageName === "$direct") {
			[builderPath, builderInfo] =
				await this.#resolver.resolveDirectBuilder(builderName);
		} else {
			[builderPath, builderInfo, isNx] = await this.#resolver.resolveBuilder(
				packageName,
				builderName,
			);
		}

		if (typeof builderInfo === "string") {
			if (!builderInfo.includes(":")) {
				builderInfo = `${packageName}:${builderInfo}`;
			} else if (builderInfo.startsWith(":")) {
				builderInfo = packageName + builderInfo;
			}

			return await this.resolveBuilder(
				builderInfo,
				(seenBuilders ??= new Set()).add(builderSpec),
			);
		}

		if (
			!isJsonObject(builderInfo) ||
			typeof builderInfo.implementation !== "string" ||
			(typeof builderInfo.schema !== "string" &&
				typeof builderInfo.schema !== "boolean")
		) {
			throw new InvalidBuilderError(
				packageName !== "$direct"
					? `Invalid configuration for builder "${builderName}" in package "${packageName}"`
					: `Invalid configuration for builder "${builderName}"`,
			);
		}

		let optionSchema: JsonValue;
		if (typeof builderInfo.schema === "boolean") {
			optionSchema = builderInfo.schema;
		} else {
			const schemaPath = join(dirname(builderPath), builderInfo.schema);
			try {
				optionSchema = JSON.parse(await readFile(schemaPath, "utf8"));
			} catch (e) {
				throw new InvalidBuilderError(
					`Couldn't load schema "${schemaPath}" for builder "${builderName}" in package "${packageName}"`,
					{cause: e},
				);
			}

			if (!isJsonObject(optionSchema)) {
				throw new InvalidBuilderError(
					`Invalid schema at "${schemaPath}" for builder "${builderName}" in package "${packageName}"`,
				);
			}
		}

		const description =
			typeof builderInfo.description === "string"
				? builderInfo.description
				: undefined!;

		let implementationPath = builderInfo.implementation;
		let implementationExport: string | null = null;

		if (implementationPath.includes("#")) {
			[implementationPath, implementationExport] = implementationPath.split(
				"#",
				2,
			) as [string, string];
		}

		return {
			packageName,
			builderName,
			description,
			optionSchema,
			implementationPath: join(dirname(builderPath), implementationPath),
			implementationExport,
			isNx,
		};
	}

	/** @override */
	async loadBuilder(
		info: SnuggeryBuilderInfo,
	): Promise<Builder<JsonObject> | null> {
		let implementation;
		try {
			implementation = await dynamicImport(info.implementationPath);

			// Normally there'd only be one level of `.default`, but if the
			// target is CJS compiled from ESM/TypeScript then it might be a CJS
			// module with a default property which is then exposed as default
			// export and wait did things just explode in our face?
			if (info.implementationExport) {
				while (
					!implementation[info.implementationExport] &&
					implementation.default
				) {
					implementation = implementation.default;
				}
				implementation = implementation[info.implementationExport];
			} else {
				while (implementation.default) {
					implementation = implementation.default;
				}
			}
		} catch (e) {
			throw new InvalidBuilderError(
				`Failed to load implementation for builder "${
					info.builderName
				}" in package "${info.packageName}": ${(e as Error)?.stack ?? e}`,
			);
		}

		if (implementation == null) {
			throw new InvalidBuilderError(
				`Failed to load implementation for builder "${info.builderName}" in package ${info.packageName}`,
			);
		}

		if (
			info.isNx ||
			(info.isNx !== false &&
				typeof info.optionSchema === "object" &&
				info.optionSchema.cli === "nx")
		) {
			return this.#workspace.convertExecutorIntoBuilder(implementation);
		}

		if (!isBuilder(implementation)) {
			throw new InvalidBuilderError(
				`Implementation for builder "${info.builderName}" in package "${info.packageName}" is not a builder`,
			);
		}

		return implementation;
	}

	/** @override */
	async getCurrentDirectory(): Promise<string> {
		return this.#context.startCwd;
	}

	/** @override */
	async getWorkspaceRoot(): Promise<string> {
		return this.#workspace.workspaceFolder ?? this.#context.startCwd;
	}

	/** @override */
	async getOptionsForTarget(target: Target): Promise<JsonObject | null> {
		return JSON.parse(
			JSON.stringify(this.#workspace.getOptionsForTarget(target)),
		);
	}

	/** @override */
	async getProjectMetadata(
		projectNameOrTarget: string | Target,
	): Promise<JsonObject> {
		return this.#workspace.getProjectMetadata(
			typeof projectNameOrTarget === "string"
				? projectNameOrTarget
				: projectNameOrTarget.project,
		);
	}
}
