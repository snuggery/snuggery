import {
	type JsonObject,
	type JsonPropertyPath,
	TargetDefinitionCollection,
	isJsonObject,
	InvalidConfigurationError,
	ProjectDefinition,
	ProjectDefinitionCollection,
	ConvertibleWorkspaceDefinition,
	WorkspaceHandle,
} from '../../types';
import type {FileHandle} from '../file';

import {AngularTargetDefinition} from './angular';

class MiniTargetDefinition extends AngularTargetDefinition {
	static fromMiniConfiguration(
		path: JsonPropertyPath,
		raw: JsonObject,
		builder: string,
	) {
		return this.fromConfiguration(path, {...raw, builder});
	}
}

class MiniTargetDefinitionCollection extends TargetDefinitionCollection {
	static fromMiniConfiguration(
		raw: JsonObject,
		targets: ReadonlyMap<string, string>,
	) {
		return new this(
			Object.fromEntries(
				Array.from(targets.entries(), ([targetName, builder]) => {
					const target = raw[targetName] ?? {};
					delete raw[targetName];

					if (!isJsonObject(target)) {
						throw new InvalidConfigurationError(
							'Target configuration must be an object',
							[targetName],
						);
					}

					return [
						targetName,
						MiniTargetDefinition.fromMiniConfiguration(
							[targetName],
							target,
							builder,
						),
					];
				}),
			),
		);
	}
}

class MiniProjectDefinition implements ProjectDefinition {
	static fromMiniConfiguration(
		raw: JsonObject,
		targets: ReadonlyMap<string, string>,
	): MiniProjectDefinition {
		return new this(
			MiniTargetDefinitionCollection.fromMiniConfiguration(raw, targets),
			raw,
		);
	}

	extensions: JsonObject;
	targets: MiniTargetDefinitionCollection;
	root = '';
	prefix = undefined;
	sourceRoot = undefined;

	private constructor(
		targets: MiniTargetDefinitionCollection,
		extensions: JsonObject,
	) {
		this.targets = targets;
		this.extensions = extensions;
	}
}

class MiniProjectDefinitionCollection extends ProjectDefinitionCollection {
	static fromMiniConfiguration(
		raw: JsonObject,
		targets: ReadonlyMap<string, string>,
	) {
		return new this({
			project: MiniProjectDefinition.fromMiniConfiguration(raw, targets),
		});
	}
}

class MiniWorkspaceDefinition extends ConvertibleWorkspaceDefinition {
	static fromMiniConfiguration(
		raw: JsonObject,
		targets: ReadonlyMap<string, string>,
	) {
		if (typeof raw.version === 'number') {
			if (raw.version !== 1) {
				throw new InvalidConfigurationError(
					'Unrecognized configuration version, expected version 1',
					['version'],
				);
			}

			delete raw.version;
		}

		return new this(
			MiniProjectDefinitionCollection.fromMiniConfiguration(raw, targets),
			raw,
		);
	}

	projects: ProjectDefinitionCollection;
	extensions: JsonObject;

	private constructor(
		projects: ProjectDefinitionCollection,
		extensions: JsonObject,
	) {
		super();
		this.projects = projects;
		this.extensions = extensions;
	}
}

export class MiniWorkspaceHandle implements WorkspaceHandle {
	readonly #file: FileHandle;
	readonly #targets: ReadonlyMap<string, string>;

	constructor(file: FileHandle, targets: ReadonlyMap<string, string>) {
		this.#file = file;
		this.#targets = targets;
	}

	async read(): Promise<ConvertibleWorkspaceDefinition> {
		return MiniWorkspaceDefinition.fromMiniConfiguration(
			await this.#file.read(),
			this.#targets,
		);
	}

	async write(): Promise<void> {
		throw new Error('Writing mini project configurations is not supported');
	}

	async update(): Promise<void> {
		throw new Error('Writing mini project configurations is not supported');
	}
}
