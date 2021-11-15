import type {workspaces} from '@angular-devkit/core';

import type {FileHandle} from '../file';
import type {JsonObject} from '../types';

export type WorkspaceDefinition = workspaces.WorkspaceDefinition;
export type ProjectDefinition = workspaces.ProjectDefinition;
export type TargetDefinition = workspaces.TargetDefinition;

abstract class DefinitionCollection<T> implements ReadonlyMap<string, T> {
	readonly #map: Map<string, T>;
	readonly #raw: JsonObject;

	constructor();
	constructor(raw: JsonObject, initial: Record<string, T>);
	constructor(raw?: JsonObject, initial?: Record<string, T>) {
		this.#raw = raw ?? {};
		this.#map = new Map(Object.entries(initial ?? {}));
	}

	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	protected _wrapValue(value: T, _raw: JsonObject): T {
		return value;
	}

	set(key: string, value: T): this {
		this.#raw[key] = {};
		const raw = this.#raw[key] as JsonObject;
		const wrapped = this._wrapValue(value, raw);
		this.#map.set(key, wrapped);
		return this;
	}

	delete(key: string): boolean {
		delete this.#raw[key];
		return this.#map.delete(key);
	}

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

export class ProjectDefinitionCollection extends DefinitionCollection<ProjectDefinition> {
	add({
		name,
		root,
		prefix,
		sourceRoot,
		targets,
		...extensions
	}: Parameters<workspaces.ProjectDefinitionCollection['add']>[0]) {
		if (this.has(name)) {
			throw new Error(`Project ${JSON.stringify(name)} already exists`);
		}

		const project = {
			root,
			prefix,
			sourceRoot,
			targets: new TargetDefinitionCollection(),
			extensions: extensions as JsonObject,
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

export class TargetDefinitionCollection extends DefinitionCollection<TargetDefinition> {
	add({
		name,
		...target
	}: Parameters<workspaces.TargetDefinitionCollection['add']>[0]) {
		if (this.has(name)) {
			throw new Error(`Target ${JSON.stringify(name)} already exists`);
		}

		return super.set(name, target).get(name)!;
	}
}

export interface WorkspaceHandle {
	read(): Promise<WorkspaceDefinition>;

	write(value: WorkspaceDefinition): Promise<void>;

	update(
		updater: (value: WorkspaceDefinition) => void | Promise<void>,
	): Promise<void>;
}

export interface WorkspaceHandleFactory {
	new (file: FileHandle): WorkspaceHandle;
}
