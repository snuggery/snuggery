import {
	getSystemPath,
	normalize,
	schema,
	virtualFs,
} from '@angular-devkit/core';
import {NodeJsSyncHost} from '@angular-devkit/core/node';
import {
	type Collection,
	type CollectionDescription,
	type EngineHost,
	HostCreateTree,
	type MergeStrategy,
	type RuleFactory,
	type Schematic,
	type SchematicDescription,
	type Source,
	type TaskExecutor,
	type TaskExecutorFactory,
	type TypedSchematicContext,
	UnregisteredTaskException,
} from '@angular-devkit/schematics';
import {BuiltinTaskExecutor} from '@angular-devkit/schematics/tasks/node';
import {
	FactoryCannotBeResolvedException,
	FileSystemCollectionDescription,
	FileSystemSchematicDesc,
	FileSystemSchematicDescription,
	SchematicMissingFactoryException,
	SchematicMissingFieldsException,
	SchematicNameCollisionException,
	validateOptionsWithSchema,
} from '@angular-devkit/schematics/tools';
import {isJsonObject, type JsonObject, type JsonValue} from '@snuggery/core';
import {createRequire} from 'module';
import {dirname, join, resolve} from 'path';
import {defer, isObservable, type Observable} from 'rxjs';
import type {Url} from 'url';

import {loadJson} from '../../utils/json-resolver';
import type {Context} from '../command/context';
import {dynamicImport} from '../utils/dynamic-import';
import {makeGeneratorIntoSchematic, Generator} from '../utils/tao';

export interface SnuggeryCollectionDescription
	extends FileSystemCollectionDescription {
	readonly schematicAliasMap: ReadonlyMap<string, string>;
	readonly generatorAliasMap: ReadonlyMap<string, string>;
	readonly generators?: {
		[name: string]: FileSystemSchematicDesc;
	};

	has(name: string): boolean;
}

export interface SnuggerySchematicDescription
	extends FileSystemSchematicDescription {
	readonly isNx: boolean | null;
}

export type SnuggeryCollection = Collection<
	SnuggeryCollectionDescription,
	SnuggerySchematicDescription
>;

export type SnuggerySchematic = Schematic<
	SnuggeryCollectionDescription,
	SnuggerySchematicDescription
>;

export type SnuggerySchematicContext = TypedSchematicContext<
	SnuggeryCollectionDescription,
	SnuggerySchematicDescription
>;

export type OptionTransform = (
	schematic: SnuggerySchematicDescription,
	options: object,
	context?: SnuggerySchematicContext,
) => Observable<object> | PromiseLike<object> | object;

export type ContextTransform = (
	context: SnuggerySchematicContext,
) => SnuggerySchematicContext;

function createAliasMap(object?: JsonValue): Map<string, string> {
	if (!isJsonObject(object)) {
		return new Map();
	}

	const aliasMap = new Map(Object.keys(object).map(name => [name, name]));

	for (const [name, {aliases = []}] of Object.entries(
		object as Record<string, JsonObject>,
	)) {
		for (const alias of aliases as string[]) {
			if (aliasMap.has(alias)) {
				throw new SchematicNameCollisionException(alias);
			}
			aliasMap.set(alias, name);
		}
	}

	return aliasMap;
}

/**
 * EngineHost compatible with both angular's NodeModulesEngineHost and Nx/Tao generators
 */
export class SnuggeryEngineHost
	implements
		EngineHost<SnuggeryCollectionDescription, SnuggerySchematicDescription>
{
	readonly #resolvePaths: readonly [string, ...string[]];

	readonly #context: Context;

	readonly #taskExecutors = new Map<string, Observable<TaskExecutor>>();

	readonly #optionTransforms: OptionTransform[] = [];

	readonly #contextTransforms: ContextTransform[] = [];

	readonly defaultMergeStrategy?: MergeStrategy;

	constructor(
		_root: string,
		{
			context,
			packageManager,
			resolvePaths,
			schemaValidation,
			optionTransforms,
			registry,
		}: {
			context: Context;
			packageManager?: string;
			resolvePaths?: [string, ...string[]];
			schemaValidation?: boolean;
			optionTransforms?: OptionTransform[];
			registry: schema.SchemaRegistry;
		},
	) {
		this.#context = context;
		this.#resolvePaths = resolvePaths ?? [
			context.workspace?.workspaceFolder ?? context.startCwd,
		];

		const rootDirectory = getSystemPath(normalize(_root));

		this.registerTaskExecutor(BuiltinTaskExecutor.NodePackage, {
			allowPackageManagerOverride: true,
			packageManager: packageManager,
			rootDirectory,
		});
		this.registerTaskExecutor(BuiltinTaskExecutor.RepositoryInitializer, {
			rootDirectory,
		});
		this.registerTaskExecutor(BuiltinTaskExecutor.RunSchematic);

		this.registerOptionsTransform((_schematic, options) =>
			JSON.parse(JSON.stringify(options)),
		);
		if (optionTransforms) {
			for (const transform of optionTransforms) {
				this.registerOptionsTransform(transform);
			}
		}

		if (schemaValidation) {
			this.registerOptionsTransform(validateOptionsWithSchema(registry));
		}
	}

	listSchematicNames(
		collection: CollectionDescription<SnuggeryCollectionDescription>,
	): string[] {
		const schematics: string[] = [];
		for (const [name, schematic] of Object.entries(collection.schematics)) {
			if (schematic.hidden || schematic.private) {
				continue;
			}

			schematics.push(name);
		}

		return schematics;
	}

	createCollectionDescription(
		name: string,
		requester?: CollectionDescription<SnuggeryCollectionDescription>,
	): CollectionDescription<SnuggeryCollectionDescription> {
		const from = requester?.path ?? this.#resolvePaths;

		const [{extends: _rawExtends, version, schematics, generators}, path] =
			loadJson(from, name, 'schematics', 'generators');

		const _extends =
			typeof _rawExtends === 'string'
				? [_rawExtends]
				: (_rawExtends as string[] | undefined);

		const schematicAliasMap = createAliasMap(schematics);
		const generatorAliasMap = createAliasMap(generators);

		const collectionDescription: CollectionDescription<SnuggeryCollectionDescription> =
			{
				name,
				path,
				extends: _extends,
				version: version as string | undefined,
				schematics:
					schematics as unknown as SnuggeryCollectionDescription['schematics'],
				generators:
					generators as unknown as SnuggeryCollectionDescription['generators'],
				schematicAliasMap,
				generatorAliasMap,
				has: name => schematicAliasMap.has(name) || generatorAliasMap.has(name),
			};

		return collectionDescription;
	}

	createSchematicDescription(
		name: string,
		collection: CollectionDescription<SnuggeryCollectionDescription>,
	): SchematicDescription<
		SnuggeryCollectionDescription,
		SnuggerySchematicDescription
	> | null {
		// First look at the nx generators, then the angular schematics, because nx's own compat functionality doesn't work in snuggery

		let isNx: boolean | null = null;
		let partialSchematic: Partial<SnuggerySchematicDescription> | null;

		if (
			collection.generators != null &&
			collection.generatorAliasMap.has(name)
		) {
			const resolvedName = collection.generatorAliasMap.get(name)!;
			const generator = collection.generators[resolvedName];

			if (generator == null) {
				return null;
			}

			isNx = true;
			partialSchematic = generator;
		} else {
			const resolvedName = collection.schematicAliasMap.get(name)!;
			const schematic = collection.schematics[resolvedName];

			if (schematic == null) {
				return null;
			}

			isNx = collection.generators != null ? false : null;
			partialSchematic = schematic;
		}

		if (partialSchematic.extends != null) {
			const [schematicName, collectionName] = partialSchematic.extends
				.split(':', 2)
				.reverse() as [string] | [string, string];

			if (collectionName != null) {
				return this.createSchematicDescription(
					schematicName,
					this.createCollectionDescription(collectionName, collection),
				);
			} else {
				return this.createSchematicDescription(schematicName, collection);
			}
		}

		if (!partialSchematic.factory) {
			throw new SchematicMissingFactoryException(name);
		}

		let factoryPath = partialSchematic.factory;
		let factoryExport: string | null = null;

		if (factoryPath.includes('#')) {
			[factoryPath, factoryExport] = factoryPath.split('#', 2) as [
				string,
				string,
			];
		}

		const require = createRequire(collection.path);
		if (/^\.\.?\//.test(factoryPath)) {
			factoryPath = require.resolve(
				resolve(dirname(collection.path), factoryPath),
			);
		} else {
			try {
				factoryPath = require.resolve(factoryPath);
			} catch {
				throw new FactoryCannotBeResolvedException(name);
			}
		}

		let schemaJson = undefined;
		if (partialSchematic.schema) {
			schemaJson = require(partialSchematic.schema);
		}

		// eslint-disable-next-line @typescript-eslint/ban-types
		const realFactoryFn: Promise<RuleFactory<{}>> = dynamicImport(
			factoryPath,
		).then(module => {
			return factoryExport != null
				? module[factoryExport!]
				: module.default ?? module;
		});
		// eslint-disable-next-line @typescript-eslint/ban-types
		const factoryFn: RuleFactory<{}> = options => () =>
			realFactoryFn.then(factory => factory(options));

		if (!partialSchematic.description) {
			throw new SchematicMissingFieldsException(name);
		}

		return {
			...(partialSchematic as SnuggerySchematicDescription),
			schema: partialSchematic.schema,
			schemaJson,
			name,
			path: dirname(factoryPath),
			factory: factoryPath,
			factoryFn,
			collection,
			isNx,
		};
	}

	getSchematicRuleFactory<OptionT extends object>(
		schematic: SchematicDescription<
			SnuggeryCollectionDescription,
			SnuggerySchematicDescription
		>,
	): RuleFactory<OptionT> {
		if (
			schematic.isNx ||
			(schematic.isNx == null && schematic.schemaJson?.cli === 'nx')
		) {
			return makeGeneratorIntoSchematic(
				schematic.factoryFn as unknown as Generator,
				this.#context.workspace?.workspaceFolder ?? this.#context.startCwd,
				this,
			) as RuleFactory<OptionT>;
		}

		return schematic.factoryFn;
	}

	createSourceFromUrl(url: Url): Source | null {
		if (url.protocol != null && url.protocol !== 'file:') {
			return null;
		}

		return context => {
			const description = context.schematic
				.description as SnuggerySchematicDescription;
			if (description.path === undefined) {
				throw new Error(
					'Unsupported schematic context. Expected a SnuggerySchematicDescription.',
				);
			}

			return new HostCreateTree(
				new virtualFs.ScopedHost(
					new NodeJsSyncHost(),
					normalize(join(description.path, url.path || '')),
				),
			);
		};
	}

	registerOptionsTransform(t: OptionTransform): void {
		this.#optionTransforms.push(t);
	}

	transformOptions<OptionT extends object, ResultT extends object>(
		schematic: SchematicDescription<
			SnuggeryCollectionDescription,
			SnuggerySchematicDescription
		>,
		options: OptionT,
		context?: SnuggerySchematicContext,
	): Observable<ResultT> {
		return defer(async () => {
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			let transformedOptions: any = options;
			for (const transformer of this.#optionTransforms) {
				const transformerResult = transformer(
					schematic,
					transformedOptions,
					context,
				);
				transformedOptions = isObservable(transformerResult)
					? await transformerResult.toPromise()
					: await transformerResult;
			}
			return transformedOptions;
		});
	}

	registerContextTransform(t: ContextTransform): void {
		this.#contextTransforms.push(t);
	}

	transformContext(
		context: SnuggerySchematicContext,
	): SnuggerySchematicContext | void {
		return this.#contextTransforms.reduce(
			(ctx, transform) => transform(ctx),
			context,
		);
	}

	// eslint-disable-next-line @typescript-eslint/ban-types
	registerTaskExecutor<O = {}>(
		factory: TaskExecutorFactory<O>,
		options?: O,
	): void {
		this.#taskExecutors.set(
			factory.name,
			defer(() => factory.create(options)),
		);
	}

	createTaskExecutor(name: string): Observable<TaskExecutor> {
		return defer(() => {
			const executor = this.#taskExecutors.get(name);

			if (executor == null) {
				throw new UnregisteredTaskException(name);
			}

			return executor;
		});
	}

	hasTaskExecutor(name: string): boolean {
		return this.#taskExecutors.has(name);
	}
}
