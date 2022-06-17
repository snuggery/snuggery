/**
 * @fileoverview Implements two-way conversion between the workspace configuration types and
 * angular's configuration format version 1 (used by angular.json, workspace.json and snuggery.json)
 */

import type {workspaces} from '@angular-devkit/core';

import {proxyObject} from '../../proxy';
import {
	InvalidConfigurationError,
	isJsonObject,
	JsonObject,
	JsonPropertyPath,
	ConvertibleWorkspaceDefinition,
	ProjectDefinition,
	ProjectDefinitionCollection,
	TargetDefinition,
	TargetDefinitionCollection,
	WorkspaceDefinition,
	WorkspaceHandle,
} from '../../types';
import type {FileHandle} from '../file';

type AngularTargetDefinitionData = JsonObject & {
	builder: string;
	defaultConfiguration?: string;
	options?: JsonObject;
	configurations?: Record<string, JsonObject>;
};

class AngularTargetDefinition implements TargetDefinition {
	static fromConfiguration(path: JsonPropertyPath, data: JsonObject) {
		if (typeof data.builder !== 'string') {
			throw new InvalidConfigurationError(
				'Property "builder" is required and must be a string',
				path,
			);
		}

		if (
			Reflect.has(data, 'defaultConfiguration') &&
			typeof data.defaultConfiguration !== 'string'
		) {
			throw new InvalidConfigurationError(
				`Property "defaultConfiguration" must be a string if present`,
				path,
			);
		}

		if (Reflect.has(data, 'options') && typeof data.options !== 'object') {
			throw new InvalidConfigurationError(
				`Property "options" must be an object or null if present`,
				path,
			);
		}

		if (Reflect.has(data, 'configurations')) {
			if (!isJsonObject(data.configurations)) {
				throw new InvalidConfigurationError(
					`Property "configurations" must be an object or null if present`,
					path,
				);
			}

			for (const [name, value] of Object.entries(data.configurations ?? {})) {
				if (value != null && !isJsonObject(value)) {
					throw new InvalidConfigurationError(
						`Configurations must be an object`,
						[...path, 'configurations', name],
					);
				}
			}
		}

		return new this(data as AngularTargetDefinitionData);
	}

	static fromValue(
		{
			builder,
			configurations,
			defaultConfiguration,
			options,
			extensions = {},
		}:
			| TargetDefinition
			| (workspaces.TargetDefinition & {extensions?: undefined}),
		raw: JsonObject,
	) {
		raw.builder = builder;

		if (defaultConfiguration != null) {
			raw.defaultConfiguration = defaultConfiguration;
		}

		if (options != null) {
			raw.options = options as JsonObject;
		}

		if (configurations != null) {
			raw.configurations = configurations as Record<string, JsonObject>;
		}

		const instance = new this(raw as AngularTargetDefinitionData);

		Object.assign(instance.extensions, extensions);

		return instance;
	}

	readonly #data: AngularTargetDefinitionData;

	readonly extensions: JsonObject;

	private constructor(data: AngularTargetDefinitionData) {
		this.#data = data;

		this.extensions = proxyObject(data, {
			remove: new Set([
				'builder',
				'defaultConfiguration',
				'options',
				'configurations',
			]),
		});
	}

	get builder(): string {
		return this.#data.builder;
	}

	set builder(builder: string) {
		this.#data.builder = builder;
	}

	get defaultConfiguration(): string | undefined {
		return this.#data.defaultConfiguration;
	}

	set defaultConfiguration(defaultConfiguration: string | undefined) {
		if (defaultConfiguration != null) {
			this.#data.defaultConfiguration = defaultConfiguration;
		} else {
			delete this.#data.defaultConfiguration;
		}
	}

	get options(): JsonObject | undefined {
		return this.#data.options;
	}

	set options(options: JsonObject | undefined) {
		if (options != null) {
			this.#data.options = options;
		} else {
			delete this.#data.options;
		}
	}

	get configurations(): Record<string, JsonObject> | undefined {
		return this.#data.configurations;
	}

	set configurations(configurations: Record<string, JsonObject> | undefined) {
		if (configurations != null) {
			this.#data.configurations = configurations;
		} else {
			delete this.#data.configurations;
		}
	}
}

class AngularTargetDefinitionCollection extends TargetDefinitionCollection {
	static fromConfiguration(path: JsonPropertyPath, raw: JsonObject) {
		return new this(
			raw,
			Object.fromEntries(
				Object.entries(raw).map(([targetName, target]) => {
					if (!isJsonObject(target)) {
						throw new InvalidConfigurationError(
							'Target configuration must be an object',
							[...path, targetName],
						);
					}

					return [
						targetName,
						AngularTargetDefinition.fromConfiguration(
							[...path, targetName],
							target,
						),
					];
				}),
			),
		);
	}

	static fromValue(
		value: workspaces.TargetDefinitionCollection,
		raw: JsonObject,
	) {
		const initial = Object.fromEntries(
			Array.from(value, ([name, originalDefinition]) => {
				raw[name] = {};
				const definition = AngularTargetDefinition.fromValue(
					originalDefinition,
					raw[name] as JsonObject,
				);

				return [name, definition];
			}),
		);

		return new this(raw, initial);
	}

	readonly #raw: JsonObject;

	private constructor(
		raw: JsonObject,
		initialValue: Record<string, TargetDefinition>,
	) {
		super(initialValue);

		this.#raw = raw;
	}

	protected override _wrapValue(
		key: string,
		value: TargetDefinition | workspaces.TargetDefinition,
	): TargetDefinition {
		this.#raw[key] = {};
		return AngularTargetDefinition.fromValue(
			value,
			this.#raw[key] as JsonObject,
		);
	}

	protected override _unwrapValue(key: string): void {
		delete this.#raw[key];
	}
}

class AngularProjectDefinition implements ProjectDefinition {
	static fromConfiguration(path: JsonPropertyPath, raw: JsonObject) {
		if (typeof raw.root !== 'string') {
			throw new InvalidConfigurationError(
				`Property "root" is required and must be a string`,
				path,
			);
		}

		if (Reflect.has(raw, 'prefix') && typeof raw.prefix !== 'string') {
			throw new InvalidConfigurationError(
				`Property "prefix" must be a string if present`,
				path,
			);
		}

		if (Reflect.has(raw, 'sourceRoot') && typeof raw.sourceRoot !== 'string') {
			throw new InvalidConfigurationError(
				`Property "sourceRoot" must be a string if present`,
				path,
			);
		}

		const hasArchitect = Reflect.has(raw, 'architect');
		const hasTargets = Reflect.has(raw, 'targets');

		if (hasArchitect && hasTargets) {
			throw new InvalidConfigurationError(
				'Project has both "targets" and "architect", but can have only one',
				path,
			);
		}

		const targetKey = hasArchitect ? 'architect' : 'targets';
		let targets;

		if (!Reflect.has(raw, targetKey)) {
			// TODO this always adds a "target" property if no targets are configured, is that bad?
			raw[targetKey] = {};
			targets = AngularTargetDefinitionCollection.fromConfiguration(
				[...path, targetKey],
				raw[targetKey] as JsonObject,
			);
		} else {
			if (!isJsonObject(raw[targetKey])) {
				throw new InvalidConfigurationError('Targets must be an object', [
					...path,
					targetKey,
				]);
			}

			targets = AngularTargetDefinitionCollection.fromConfiguration(
				[...path, targetKey],
				raw[targetKey] as JsonObject,
			);
		}

		return new this(targets, raw);
	}

	static fromValue(
		value: ProjectDefinition | workspaces.ProjectDefinition,
		raw: JsonObject,
	) {
		raw.root = value.root;

		if (value.sourceRoot != null) {
			raw.sourceRoot = value.sourceRoot;
		}

		if (value.prefix != null) {
			raw.prefix = value.prefix;
		}

		raw.targets = {};
		const targets = AngularTargetDefinitionCollection.fromValue(
			value.targets,
			raw.targets as JsonObject,
		);

		const instance = new this(targets, raw);

		// Assign to the proxyObject to ensure renames and removes are applied
		Object.assign(instance.extensions, value.extensions);

		return instance;
	}

	readonly extensions: JsonObject;
	readonly targets: AngularTargetDefinitionCollection;

	readonly #data: JsonObject & {
		root: string;
		prefix?: string;
		sourceRoot?: string;
	};

	constructor(targets: AngularTargetDefinitionCollection, raw: JsonObject) {
		this.targets = targets;

		this.extensions = proxyObject(raw, {
			remove: new Set(['root', 'prefix', 'sourceRoot', 'targets', 'architect']),
		});

		this.#data = raw as JsonObject & {
			root: string;
			prefix?: string;
			sourceRoot?: string;
		};
	}

	get root(): string {
		return this.#data.root;
	}

	set root(root: string) {
		this.#data.root = root;
	}

	get prefix(): string | undefined {
		return this.#data.prefix;
	}

	set prefix(prefix: string | undefined) {
		if (prefix != null) {
			this.#data.prefix = prefix;
		} else {
			delete this.#data.prefix;
		}
	}

	get sourceRoot(): string | undefined {
		return this.#data.sourceRoot;
	}

	set sourceRoot(sourceRoot: string | undefined) {
		if (sourceRoot != null) {
			this.#data.sourceRoot = sourceRoot;
		} else {
			delete this.#data.sourceRoot;
		}
	}
}

class AngularProjectDefinitionCollection extends ProjectDefinitionCollection {
	static fromConfiguration(path: JsonPropertyPath, raw: JsonObject) {
		return new this(
			raw,
			Object.fromEntries(
				Object.entries(raw).map(([projectName, project]) => {
					if (!isJsonObject(project)) {
						throw new InvalidConfigurationError(
							'Project configuration must be an object',
							[...path, projectName],
						);
					}

					return [
						projectName,
						AngularProjectDefinition.fromConfiguration(
							[...path, projectName],
							project,
						),
					];
				}),
			),
		);
	}

	static fromValue(
		value: ProjectDefinitionCollection | workspaces.ProjectDefinitionCollection,
		raw: JsonObject,
	) {
		const initial = Object.fromEntries(
			Array.from(value, ([name, originalDefinition]) => {
				raw[name] = {};
				const definition = AngularProjectDefinition.fromValue(
					originalDefinition,
					raw[name] as JsonObject,
				);

				return [name, definition];
			}),
		);

		return new this(raw, initial);
	}

	readonly #raw: JsonObject;

	private constructor(
		raw: JsonObject,
		initial: Record<string, ProjectDefinition>,
	) {
		super(initial);
		this.#raw = raw;
	}

	protected override _wrapValue(
		key: string,
		value: ProjectDefinition,
	): ProjectDefinition {
		this.#raw[key] = {};
		return AngularProjectDefinition.fromValue(
			value,
			this.#raw[key] as JsonObject,
		);
	}

	protected override _unwrapValue(key: string): void {
		delete this.#raw[key];
	}
}

export class AngularWorkspaceDefinition extends ConvertibleWorkspaceDefinition {
	static fromConfiguration(raw: JsonObject) {
		if (typeof raw.version !== 'number') {
			throw new InvalidConfigurationError('Configuration must have a version');
		}

		if (raw.version !== 1) {
			throw new InvalidConfigurationError(
				'Unrecognized configuration version, expected version 1',
				['version'],
			);
		}

		let projects;

		if (!Reflect.has(raw, 'projects')) {
			// TODO this always adds a "projects" property if no projects are configured, is that bad?
			raw.projects = {};
			projects = AngularProjectDefinitionCollection.fromConfiguration(
				['projects'],
				raw.projects as JsonObject,
			);
		} else {
			if (!isJsonObject(raw.projects)) {
				throw new InvalidConfigurationError('Projects must be an object', [
					'projects',
				]);
			}

			projects = AngularProjectDefinitionCollection.fromConfiguration(
				['projects'],
				raw.projects,
			);
		}

		return new this(projects, raw);
	}

	static fromValue(
		value: WorkspaceDefinition | workspaces.WorkspaceDefinition,
	) {
		if (value instanceof AngularWorkspaceDefinition) {
			return value;
		}

		const raw: JsonObject = {
			version: 1,
		};

		const instance = new this(
			AngularProjectDefinitionCollection.fromValue(
				value.projects,
				(raw.projects = {}),
			),
			raw,
		);

		// Assign to the proxyObject to ensure renames and removes are applied
		Object.assign(instance.extensions, value.extensions);

		return instance;
	}

	readonly extensions: JsonObject;
	readonly projects: AngularProjectDefinitionCollection;

	readonly data: JsonObject;

	constructor(projects: AngularProjectDefinitionCollection, raw: JsonObject) {
		super();
		this.projects = projects;

		this.extensions = proxyObject(raw, {
			remove: new Set(['projects', 'version', '$schema']),
		});

		this.data = raw;
	}
}

export class AngularWorkspaceHandle implements WorkspaceHandle {
	readonly #file: FileHandle;

	constructor(file: FileHandle) {
		this.#file = file;
	}

	async read(): Promise<ConvertibleWorkspaceDefinition> {
		return AngularWorkspaceDefinition.fromConfiguration(
			await this.#file.read(),
		);
	}

	async write(
		value: WorkspaceDefinition | workspaces.WorkspaceDefinition,
		options: {header?: string | string[]},
	): Promise<void> {
		await this.#file.write(
			AngularWorkspaceDefinition.fromValue(value).data,
			options,
		);
	}

	async update(
		updater: (value: ConvertibleWorkspaceDefinition) => void | Promise<void>,
	): Promise<void> {
		await this.#file.update(data =>
			updater(AngularWorkspaceDefinition.fromConfiguration(data)),
		);
	}
}
