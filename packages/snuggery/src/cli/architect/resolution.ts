import type {JsonObject, JsonValue} from "@snuggery/core";
import {createRequire} from "module";
import {basename, extname, join} from "path";
import {pathToFileURL} from "url";

import {loadJson} from "../../utils/json-resolver.js";
import type {Context} from "../command/context.js";

import {InvalidBuilderError, UnknownBuilderError} from "./errors.js";
import {Builder, isBuilder, ResolverFacade, WorkspaceFacade} from "./host.js";

const {hasOwnProperty} = Object.prototype;

export class Resolver implements ResolverFacade {
	readonly #context: Pick<Context, "startCwd">;
	readonly #workspace: WorkspaceFacade;

	constructor(context: Pick<Context, "startCwd">, workspace: WorkspaceFacade) {
		this.#context = context;
		this.#workspace = workspace;
	}

	async loadBuilders(
		packageName: string,
	): Promise<
		[
			path: string,
			builders: Record<string, JsonObject>,
			executors?: Record<string, JsonObject>,
		]
	> {
		const [json, path] = loadJson(
			this.#workspace.workspaceFolder ?? this.#context.startCwd,
			packageName,
			"builders",
			"executors",
		);

		return [
			path,
			(json.builders as Record<string, JsonObject>) ?? {},
			(json.executors as Record<string, JsonObject>) ?? {},
		];
	}

	async resolveBuilder(
		packageName: string,
		builderName: string,
	): Promise<
		[builderPath: string, builderInfo: JsonValue, isNx: boolean | null]
	> {
		const [builderPath, builderJson, executorsJson] =
			await this.loadBuilders(packageName);

		let builderInfo: JsonValue;
		let isNx: boolean | null = null;

		// We have to give Nx executors precedence, because nx's own plugins tend to provide a
		// fallback for the @angular/cli that fails to load snuggery.json files when looking for
		// workspace configuration
		if (
			executorsJson != null &&
			hasOwnProperty.call(executorsJson, builderName)
		) {
			builderInfo = executorsJson[builderName]!;
			isNx = true;
		} else if (hasOwnProperty.call(builderJson, builderName)) {
			if (executorsJson != null) {
				isNx = false;
			}
			builderInfo = builderJson[builderName]!;
		} else {
			throw new UnknownBuilderError(
				`Can't find "${builderName}" in "${packageName}"`,
			);
		}

		return [builderPath, builderInfo, isNx];
	}

	async resolveDirectBuilder(
		path: string,
	): Promise<[path: string, info: JsonObject]> {
		for (const folder of new Set(
			this.#workspace.workspaceFolder != null
				? [this.#context.startCwd, this.#workspace.workspaceFolder]
				: [this.#context.startCwd],
		)) {
			const require = createRequire(join(folder, "<synthetic>"));

			let resolvedPath;
			try {
				resolvedPath = require.resolve(path);
			} catch {
				continue;
			}

			let schemaOrBuilder: JsonObject | Builder;
			try {
				schemaOrBuilder =
					extname(resolvedPath) === ".json"
						? require(resolvedPath)
						: await import(pathToFileURL(resolvedPath).href).then(
								(module) => module.default ?? module,
						  );
			} catch {
				throw new InvalidBuilderError(
					`Failed to load builder file "${resolvedPath}" for builder "${path}"`,
				);
			}

			if (
				schemaOrBuilder == null ||
				typeof schemaOrBuilder !== "object" ||
				Array.isArray(schemaOrBuilder)
			) {
				throw new InvalidBuilderError(
					`File "${resolvedPath}" for builder "${path}" does not contain a valid builder`,
				);
			}

			if (isBuilder(schemaOrBuilder)) {
				return [
					resolvedPath,
					{
						schema: true,
						implementation: basename(resolvedPath),
					},
				];
			} else if (
				typeof schemaOrBuilder.type === "string" &&
				typeof schemaOrBuilder.implementation === "string"
			) {
				return [
					resolvedPath,
					{
						schema: basename(resolvedPath),
						implementation: schemaOrBuilder.implementation,
					},
				];
			} else {
				return [resolvedPath, schemaOrBuilder];
			}
		}

		throw new UnknownBuilderError(`Can't resolve builder "${path}"`);
	}
}
