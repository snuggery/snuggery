import type {JsonObject, JsonValue} from '@angular-devkit/core';
import {createRequire} from 'module';
import {basename, join} from 'path';

import {loadJson} from '../../utils/json-resolver';
import type {Context} from '../command/context';

import {InvalidBuilderError, UnknownBuilderError} from './errors';
import {Builder, isBuilder, ResolverFacade, WorkspaceFacade} from './host';

const {hasOwnProperty} = Object.prototype;

export class Resolver implements ResolverFacade {
	constructor(
		private readonly context: Pick<Context, 'startCwd'>,
		private readonly workspace: WorkspaceFacade,
	) {}

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
			this.workspace.basePath ?? this.context.startCwd,
			packageName,
			'builders',
			'executors',
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
		const [builderPath, builderJson, executorsJson] = await this.loadBuilders(
			packageName,
		);

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
		for (const basePath of new Set(
			this.workspace.basePath != null
				? [this.context.startCwd, this.workspace.basePath]
				: [this.context.startCwd],
		)) {
			const require = createRequire(join(basePath, '<synthetic>'));

			let resolvedPath;
			try {
				resolvedPath = require.resolve(path);
			} catch {
				continue;
			}

			let schemaOrBuilder: JsonObject | Builder;
			try {
				schemaOrBuilder = await import(resolvedPath).then(
					module => module.default ?? module,
				);
			} catch {
				throw new InvalidBuilderError(
					`Failed to load builder file "${resolvedPath}" for builder "${path}"`,
				);
			}

			if (
				schemaOrBuilder == null ||
				typeof schemaOrBuilder !== 'object' ||
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
				typeof schemaOrBuilder.type === 'string' &&
				typeof schemaOrBuilder.implementation === 'string'
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
