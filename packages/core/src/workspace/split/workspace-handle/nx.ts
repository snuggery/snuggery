/**
 * @fileoverview Implements two-way conversion between the workspace configuration types and
 * nx's configuration format version 2 (used by workspace.json)
 */

import type {workspaces} from "@angular-devkit/core";

import {proxyObject} from "../../proxy";
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
} from "../../types";
import type {FileHandle} from "../file";

import {AngularWorkspaceDefinition} from "./angular";

type NxTargetDefinitionData = JsonObject & {
	executor: string;
	defaultConfiguration?: string;
	options?: JsonObject;
	configurations?: Record<string, JsonObject>;
};

const projectFilenames = ["project.json", ".project.json"];

class NxTargetDefinition implements TargetDefinition {
	static fromConfiguration(path: JsonPropertyPath, data: JsonObject) {
		if (typeof data.executor !== "string") {
			throw new InvalidConfigurationError(
				'Property "executor" is required and must be a string',
				path,
			);
		}

		if (
			Reflect.has(data, "defaultConfiguration") &&
			typeof data.defaultConfiguration !== "string"
		) {
			throw new InvalidConfigurationError(
				`Property "defaultConfiguration" must be a string if present`,
				path,
			);
		}

		if (Reflect.has(data, "options") && typeof data.options !== "object") {
			throw new InvalidConfigurationError(
				`Property "options" must be an object or null if present`,
				path,
			);
		}

		if (Reflect.has(data, "configurations")) {
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
						[...path, "configurations", name],
					);
				}
			}
		}

		return new this(data as NxTargetDefinitionData);
	}

	static fromValue(
		{
			builder,
			configurations,
			defaultConfiguration,
			options,
			extensions,
		}:
			| TargetDefinition
			| (workspaces.TargetDefinition & {extensions?: undefined}),
		raw: JsonObject,
	) {
		raw.executor = builder;

		if (defaultConfiguration != null) {
			raw.defaultConfiguration = defaultConfiguration;
		}

		if (options != null) {
			raw.options = options as JsonObject;
		}

		if (configurations != null) {
			raw.configurations = configurations as Record<string, JsonObject>;
		}

		const instance = new this(raw as NxTargetDefinitionData);

		Object.assign(instance.extensions, extensions);

		return instance;
	}

	readonly #data: NxTargetDefinitionData;

	readonly extensions: JsonObject;

	private constructor(data: NxTargetDefinitionData) {
		this.#data = data;

		this.extensions = proxyObject(data, {
			remove: new Set([
				"executor",
				"defaultConfiguration",
				"options",
				"configurations",
			]),
		});
	}

	get builder(): string {
		return this.#data.executor;
	}

	set builder(builder: string) {
		this.#data.executor = builder;
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

class NxTargetDefinitionCollection extends TargetDefinitionCollection {
	static fromConfiguration(
		path: JsonPropertyPath,
		raw: JsonObject | (() => JsonObject),
	) {
		if (typeof raw === "function") {
			return new this(raw, undefined);
		}

		return new this(
			raw,
			Object.fromEntries(
				Object.entries(raw).map(([targetName, target]) => {
					if (!isJsonObject(target)) {
						throw new InvalidConfigurationError(
							"Target configuration must be an object",
							[...path, targetName],
						);
					}

					return [
						targetName,
						NxTargetDefinition.fromConfiguration([...path, targetName], target),
					];
				}),
			),
		);
	}

	static fromValue(
		value: TargetDefinitionCollection | workspaces.TargetDefinitionCollection,
		getRaw: () => JsonObject,
	) {
		if (value.size === 0) {
			return new this(getRaw, undefined);
		}

		const raw = getRaw();
		const initial = Object.fromEntries(
			Array.from(value, ([name, originalDefinition]) => {
				raw[name] = {};
				const definition = NxTargetDefinition.fromValue(
					originalDefinition,
					raw[name] as JsonObject,
				);

				return [name, definition];
			}),
		);

		return new this(raw, initial);
	}

	#_raw: JsonObject | (() => JsonObject);

	private constructor(
		raw: JsonObject | (() => JsonObject),
		initial: Record<string, TargetDefinition> | undefined,
	) {
		super(initial);
		this.#_raw = raw;
	}

	get #raw(): JsonObject {
		if (typeof this.#_raw === "function") {
			this.#_raw = this.#_raw();
		}

		return this.#_raw;
	}

	protected override _wrapValue(
		key: string,
		value: TargetDefinition,
	): TargetDefinition {
		this.#raw[key] = {};
		return NxTargetDefinition.fromValue(value, this.#raw[key] as JsonObject);
	}

	protected override _unwrapValue(key: string): void {
		delete this.#raw[key];
	}
}

class NxProjectDefinition implements ProjectDefinition {
	static fromConfiguration(path: JsonPropertyPath, raw: JsonObject) {
		if (typeof raw.root !== "string") {
			throw new InvalidConfigurationError(
				`Property "root" is required and must be a string`,
				path,
			);
		}

		if (Reflect.has(raw, "prefix") && typeof raw.prefix !== "string") {
			throw new InvalidConfigurationError(
				`Property "prefix" must be a string if present`,
				path,
			);
		}

		if (Reflect.has(raw, "sourceRoot") && typeof raw.sourceRoot !== "string") {
			throw new InvalidConfigurationError(
				`Property "sourceRoot" must be a string if present`,
				path,
			);
		}

		let targets;

		if (!Reflect.has(raw, "targets")) {
			targets = NxTargetDefinitionCollection.fromConfiguration(
				[...path, "targets"],
				() => {
					raw.targets = {};
					return raw.targets;
				},
			);
		} else {
			if (!isJsonObject(raw.targets)) {
				throw new InvalidConfigurationError("Targets must be an object", [
					...path,
					"targets",
				]);
			}

			targets = NxTargetDefinitionCollection.fromConfiguration(
				[...path, "targets"],
				raw.targets,
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

		const targets = NxTargetDefinitionCollection.fromValue(
			value.targets,
			() => (raw.targets = {}),
		);

		const instance = new this(targets, raw);

		// Assign to the proxyObject to ensure renames and removes are applied
		Object.assign(instance.extensions, value.extensions);

		return instance;
	}

	readonly extensions: JsonObject;
	readonly targets: NxTargetDefinitionCollection;

	readonly #data: JsonObject & {
		root: string;
		prefix?: string;
		sourceRoot?: string;
	};

	private constructor(targets: NxTargetDefinitionCollection, raw: JsonObject) {
		this.targets = targets;

		this.extensions = proxyObject(raw, {
			remove: new Set(["root", "prefix", "sourceRoot", "targets", "architect"]),
			rename: new Map([["schematics", "generators"]]),
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

class NxProjectDefinitionCollection extends ProjectDefinitionCollection {
	static async fromConfiguration(
		path: JsonPropertyPath,
		raw: JsonObject | (() => JsonObject),
		file?: FileHandle,
		objectsAndFiles?: [JsonObject, FileHandle][],
	) {
		if (typeof raw === "function") {
			return new this(raw, undefined);
		}

		return new this(
			raw,
			Object.fromEntries(
				await Promise.all(
					Object.entries(raw).map(async ([projectName, project]) => {
						let projectFile: FileHandle | undefined;

						if (file != null && typeof project == "string") {
							projectFile = await file.openRelative(project, projectFilenames);
							project = await projectFile.read();

							objectsAndFiles!.push([project, projectFile]);
						}

						if (!isJsonObject(project)) {
							throw new InvalidConfigurationError(
								"Project configuration must be an object",
								[...path, projectName],
							);
						}

						return [
							projectName,
							NxProjectDefinition.fromConfiguration(
								[...path, projectName],
								project,
							),
						];
					}),
				),
			),
		);
	}

	static fromValue(
		value: ProjectDefinitionCollection | workspaces.ProjectDefinitionCollection,
		getRaw: () => JsonObject,
	) {
		if (value.size === 0) {
			return new this(getRaw, undefined);
		}

		const raw = getRaw();
		const initial = Object.fromEntries(
			Array.from(value, ([name, originalDefinition]) => {
				raw[name] = {};
				const definition = NxProjectDefinition.fromValue(
					originalDefinition,
					raw[name] as JsonObject,
				);

				return [name, definition];
			}),
		);

		return new this(raw, initial);
	}

	#_raw: JsonObject | (() => JsonObject);

	private constructor(
		raw: JsonObject | (() => JsonObject),
		initial: Record<string, ProjectDefinition> | undefined,
	) {
		super(initial);
		this.#_raw = raw;
	}

	get #raw(): JsonObject {
		if (typeof this.#_raw === "function") {
			this.#_raw = this.#_raw();
		}

		return this.#_raw;
	}

	protected override _wrapValue(
		key: string,
		value: ProjectDefinition,
	): ProjectDefinition {
		this.#raw[key] = {};
		return NxProjectDefinition.fromValue(value, this.#raw[key] as JsonObject);
	}

	protected override _unwrapValue(key: string): void {
		delete this.#raw[key];
	}
}

export class NxWorkspaceDefinition extends ConvertibleWorkspaceDefinition {
	static async fromConfiguration(raw: JsonObject, file?: FileHandle) {
		if (typeof raw.version !== "number") {
			throw new InvalidConfigurationError("Configuration must have a version");
		}

		if (raw.version !== 2) {
			throw new InvalidConfigurationError(
				"Unrecognized configuration version, expected version 2",
				["version"],
			);
		}

		let projects;
		const projectsAndFiles: [JsonObject, FileHandle][] | undefined = file
			? [[raw, file]]
			: undefined;

		if (!Reflect.has(raw, "projects")) {
			projects = await NxProjectDefinitionCollection.fromConfiguration(
				["projects"],
				() => {
					raw.projects = {};
					return raw.projects;
				},
				file,
				projectsAndFiles,
			);
		} else {
			if (!isJsonObject(raw.projects)) {
				throw new InvalidConfigurationError("Projects must be an object", [
					"projects",
				]);
			}

			projects = await NxProjectDefinitionCollection.fromConfiguration(
				["projects"],
				raw.projects,
				file,
				projectsAndFiles,
			);
		}

		return new this(projects, raw, projectsAndFiles);
	}

	static fromValue(
		value: WorkspaceDefinition | workspaces.WorkspaceDefinition,
	) {
		if (value instanceof NxWorkspaceDefinition) {
			return value;
		}

		const raw: JsonObject = {
			version: 2,
		};

		const instance = new this(
			NxProjectDefinitionCollection.fromValue(
				value.projects,
				() => (raw.projects = {}),
			),
			raw,
		);

		// Assign to the proxyObject to ensure renames and removes are applied
		Object.assign(instance.extensions, value.extensions);

		return instance;
	}

	readonly extensions: JsonObject;
	readonly projects: NxProjectDefinitionCollection;

	readonly data: JsonObject;

	readonly #files?: [JsonObject, FileHandle][];

	private constructor(
		projects: NxProjectDefinitionCollection,
		raw: JsonObject,
		files?: [JsonObject, FileHandle][],
	) {
		super();
		this.projects = projects;
		this.#files = files;

		this.extensions = proxyObject(raw, {
			remove: new Set(["projects", "version", "$schema"]),
			rename: new Map([["schematics", "generators"]]),
		});

		this.data = raw;
	}

	public async tryWrite(): Promise<boolean> {
		if (this.#files == null) {
			return false;
		}

		await Promise.all(
			Array.from(this.#files, ([data, file]) => file.write(data, {})),
		);

		return true;
	}
}

export class NxWorkspaceHandle implements WorkspaceHandle {
	readonly #file: FileHandle;

	constructor(file: FileHandle) {
		this.#file = file;
	}

	async read(): Promise<ConvertibleWorkspaceDefinition> {
		const data = await this.#file.read();

		if (data.version === 1) {
			return AngularWorkspaceDefinition.fromConfiguration(data);
		} else {
			return NxWorkspaceDefinition.fromConfiguration(data, this.#file);
		}
	}

	async write(
		value: WorkspaceDefinition | workspaces.WorkspaceDefinition,
		options: {header?: string | string[]},
	): Promise<void> {
		if (value instanceof NxWorkspaceDefinition) {
			if (!(await value.tryWrite())) {
				await this.#file.write(value.data, options);
			}
		} else if (value instanceof AngularWorkspaceDefinition) {
			await this.#file.write(value.data, options);
		} else {
			await this.#file.write(
				NxWorkspaceDefinition.fromValue(value).data,
				options,
			);
		}
	}

	async update(
		updater: (value: ConvertibleWorkspaceDefinition) => void | Promise<void>,
	): Promise<void> {
		// The FileHandle#update function automatically tracks file reads and will
		// ensure updates are written to disk. Unlike `write` where we do not have
		// the link between FileHandle and the content of the file that's being
		// written, we do not have to track anything extra here.
		await this.#file.update(async (data) =>
			updater(
				data.version === 1
					? AngularWorkspaceDefinition.fromConfiguration(data)
					: await NxWorkspaceDefinition.fromConfiguration(data, this.#file),
			),
		);
	}
}
