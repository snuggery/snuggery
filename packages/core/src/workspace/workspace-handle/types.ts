import type {workspaces} from '@angular-devkit/core';

import type {FileHandle} from '../file';
import type {JsonObject} from '../types';

/**
 * The definition of a single target
 */
export interface TargetDefinition {
	/**
	 * Builder (also known as executor) for this target
	 */
	builder: string;

	/**
	 * Options to pass into the builder, if any
	 */
	options?: JsonObject;

	/**
	 * Configurations to allow different options, if required
	 *
	 * Active configurations are merged (shallowly) into the options passed into the builder.
	 */
	configurations?: Record<string, JsonObject>;

	/**
	 * Default configuration(s) to use when no configuration is passed
	 *
	 * Can be a comma delimited list of configuration names or a single configuration name
	 */
	defaultConfiguration?: string;

	/**
	 * Extensions on the target object, e.g. nx's `dependsOn`
	 *
	 * Modifications on this object will be cloned, so if you add an extension with an object or array
	 * as value, changing the object or array after adding it to the extensions will not result in the
	 * configuration changing as well.
	 */
	readonly extensions: JsonObject;
}

export interface ProjectDefinition {
	/**
	 * Extensions on the project, e.g. `cli` or `schematics`
	 *
	 * Modifications on this object will be cloned, so if you add an extension with an object or array
	 * as value, changing the object or array after adding it to the extensions will not result in the
	 * configuration changing as well.
	 *
	 * Note schematics configuration is always called `schematics` on this object, regardless of
	 * whether the configuration is an `angular.json` file (where it is named `schematics`) or a
	 * `workspace.json` file (where it is named `generators`).
	 */
	readonly extensions: JsonObject;

	/**
	 * Targets defined on this project
	 */
	readonly targets: TargetDefinitionCollection;

	/**
	 * The location of this project, using `/` as delimiter
	 */
	root: string;

	/**
	 * Prefix prepended to generated selectors
	 */
	prefix?: string;

	/**
	 * The location of the source files in this project
	 */
	sourceRoot?: string;
}

export interface WorkspaceDefinition {
	/**
	 * Extensions on the workspace, e.g. `cli` or `schematics`
	 *
	 * Modifications on this object will be cloned, so if you add an extension with an object or array
	 * as value, changing the object or array after adding it to the extensions will not result in the
	 * configuration changing as well.
	 *
	 * Note schematics configuration is always called `schematics` on this object, regardless of
	 * whether the configuration is an `angular.json` file (where it is named `schematics`) or a
	 * `workspace.json` file (where it is named `generators`).
	 */
	readonly extensions: JsonObject;

	/**
	 * Projects registered in the workspace
	 */
	readonly projects: ProjectDefinitionCollection;
}

export abstract class ConvertibleWorkspaceDefinition
	implements WorkspaceDefinition
{
	abstract readonly extensions: JsonObject;
	abstract readonly projects: ProjectDefinitionCollection;

	/**
	 * Return an object that complies with Angular's WorkspaceDefinition interface
	 *
	 * Changes made onto this workspace definition will reflect on the return value, and changes made
	 * onto the return value reflect on this workspace definition, making it safe to pass along and
	 * modify.
	 */
	toAngularWorkspaceDefinition(): workspaces.WorkspaceDefinition {
		// This method might look pointless, but it isn't. We've patched the @angular-devkit/core types
		// to remove some private properties on the workspace types which allow us to pass off snuggery
		// types as if they're angular types.
		// Downstream projects won't include the same patch, so they won't be able to pass off a
		// snuggery workspace definition as an angular workspace definition. This method allows these
		// projects to cast without having to do `as unknown as workspaces.WorkspaceDefinition`.
		return this;
	}
}

abstract class DefinitionCollection<T, N> implements ReadonlyMap<string, T> {
	readonly #map: Map<string, T>;
	readonly #raw: JsonObject;

	/**
	 * Create a new, empty, collection
	 */
	constructor();
	/**
	 * Create a collection based on existing data
	 *
	 * @param raw The raw serializable data reflecting the collection
	 * @param initial The data of the collection
	 */
	constructor(raw: JsonObject, initial: Record<string, T>);
	constructor(raw?: JsonObject, initial?: Record<string, T>) {
		this.#raw = raw ?? {};
		this.#map = new Map(Object.entries(initial ?? {}));
	}

	protected abstract _wrapValue(value: T | N, raw: JsonObject): T;

	/**
	 * Stores the given value under the given name in the collection, overriding any pre-existing value
	 *
	 * The given value will be cloned before adding it to the collection, meaning any changes made to
	 * the value (or a property of the value) after adding it will not be reflected in the collection.
	 *
	 * ```js
	 * value.extensions.lorem = 'ipsum';
	 * collection.set(name, value);
	 * value.extensions.lorem = 'dolor';
	 *
	 * assert(collection.get(name).extensions.lorem === 'ipsum');
	 * ```
	 */
	set(key: string, value: T | N): this {
		this.#raw[key] = {};
		const raw = this.#raw[key] as JsonObject;
		const wrapped = this._wrapValue(value, raw);
		this.#map.set(key, wrapped);
		return this;
	}

	/**
	 * Remove the entry with the given key from this collection, if present
	 */
	delete(key: string): boolean {
		delete this.#raw[key];
		return this.#map.delete(key);
	}

	/* eslint-disable @typescript-eslint/no-explicit-any */
	forEach(
		callbackfn: (value: T, key: string, map: this) => void,
		thisArg?: any,
	): void {
		// We can't use an arrow function because we need that function's `this` property, so we must
		// alias `this` here.
		// eslint-disable-next-line @typescript-eslint/no-this-alias
		const _that = this;
		return this.#map.forEach(function (this: any, value, key) {
			callbackfn.call(this, value, key, _that);
		}, thisArg);
	}
	/* eslint-enable @typescript-eslint/no-explicit-any */

	get(key: string): T | undefined {
		return this.#map.get(key);
	}

	has(key: string): boolean {
		return this.#map.has(key);
	}

	get size(): number {
		return this.#map.size;
	}

	entries(): IterableIterator<[string, T]> {
		return this.#map.entries();
	}

	keys(): IterableIterator<string> {
		return this.#map.keys();
	}

	values(): IterableIterator<T> {
		return this.#map.values();
	}

	[Symbol.iterator](): IterableIterator<[string, T]> {
		return this.#map[Symbol.iterator]();
	}
}

export class ProjectDefinitionCollection extends DefinitionCollection<
	ProjectDefinition,
	workspaces.ProjectDefinition
> {
	protected _wrapValue(
		value: ProjectDefinition | workspaces.ProjectDefinition,
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		_raw: JsonObject,
	): ProjectDefinition {
		const clonedValue: ProjectDefinition = {
			...(value as ProjectDefinition),
			targets: new TargetDefinitionCollection(),
		};

		for (const [name, target] of value.targets) {
			clonedValue.targets.set(name, target);
		}

		return clonedValue;
	}

	/**
	 * Add a new project to the collection
	 *
	 * The given project will be cloned before adding it to the collection, meaning any changes made to
	 * the project (or a property of the project) after adding it will not be reflected in the collection.
	 *
	 * ```js
	 * project.root = 'packages/lorem';
	 * collection.add(project);
	 * project.root = 'packages/ipsum';
	 *
	 * assert(collection.get(project.name).root === 'lorem');
	 * ```
	 *
	 * @throws if a project with the given name is already present
	 */
	add(
		...project: Parameters<workspaces.ProjectDefinitionCollection['add']>
	): ProjectDefinition;
	/**
	 * Add a new project to the collection
	 *
	 * The given project will be cloned before adding it to the collection, meaning any changes made to
	 * the project (or a property of the project) after adding it will not be reflected in the collection.
	 *
	 * ```js
	 * project.root = 'packages/lorem';
	 * collection.add(project);
	 * project.root = 'packages/ipsum';
	 *
	 * assert(collection.get(project.name).root === 'lorem');
	 * ```
	 *
	 * @throws if a project with the given name is already present
	 */
	add(
		project: JsonObject & {
			name: string;
			root: string;
			prefix?: string;
			sourceRoot?: string;
			targets: Record<string, TargetDefinition | workspaces.TargetDefinition>;
		},
	): ProjectDefinition;
	add({
		name,
		root,
		prefix,
		sourceRoot,
		targets,
		...extensions
	}: JsonObject & {
		name: string;
		root: string;
		prefix?: string;
		sourceRoot?: string;
		targets: Record<string, TargetDefinition | workspaces.TargetDefinition>;
	}): ProjectDefinition {
		if (this.has(name)) {
			throw new Error(`Project ${JSON.stringify(name)} already exists`);
		}

		const project = {
			root,
			prefix,
			sourceRoot,
			targets: new TargetDefinitionCollection(),
			extensions,
		};

		if (targets != null) {
			for (const [name, target] of Object.entries(targets)) {
				if (target) {
					project.targets.set(name, target);
				}
			}
		}

		return this.set(name, project).get(name)!;
	}
}

export class TargetDefinitionCollection extends DefinitionCollection<
	TargetDefinition,
	workspaces.TargetDefinition
> {
	protected _wrapValue(
		value: TargetDefinition | workspaces.TargetDefinition,
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		_raw: JsonObject,
	): TargetDefinition {
		// @ts-expect-error There's no cast that makes typescript happy here
		return {extensions: {}, ...value};
	}

	/**
	 * Add a new target to the collection
	 *
	 * The given target will be cloned before adding it to the collection, meaning any changes made to
	 * the target (or a property of the target) after adding it will not be reflected in the collection.
	 *
	 * ```js
	 * target.builder = '@lorem/ipsum:build';
	 * collection.add(target);
	 * target.builder = '@dolor/sit:test';
	 *
	 * assert(collection.get(target.name).builder === '@lorem/ipsum:build');
	 * ```
	 *
	 * @throws if a target with the given name is already present
	 */
	add({
		name,
		builder,
		configurations,
		defaultConfiguration,
		options,
		...extensions
	}: Omit<TargetDefinition, 'extensions'> & {name: string} & JsonObject) {
		if (this.has(name)) {
			throw new Error(`Target ${JSON.stringify(name)} already exists`);
		}

		return super
			.set(name, {
				builder,
				configurations,
				defaultConfiguration,
				options,
				extensions,
			})
			.get(name)!;
	}
}

export interface WorkspaceHandle {
	read(): Promise<ConvertibleWorkspaceDefinition>;

	write(
		value: WorkspaceDefinition | workspaces.WorkspaceDefinition,
	): Promise<void>;

	update(
		updater: (value: ConvertibleWorkspaceDefinition) => void | Promise<void>,
	): Promise<void>;
}

export interface WorkspaceHandleFactory {
	new (file: FileHandle): WorkspaceHandle;
}
