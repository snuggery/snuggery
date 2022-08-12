import type {json} from '@angular-devkit/core';
import {
	isJsonArray,
	isJsonObject,
	JsonObject,
	JsonValue,
	JsonPropertyPath,
	ProjectDefinitionCollection,
	nodeFsHost,
	readWorkspace,
	workspaceFilenames,
	writeWorkspace,
	updateWorkspace,
} from '@snuggery/core';
import {Option} from 'clipanion';
import {join} from 'path';

import {AbstractCommand} from '../command/abstract-command';
import {CliWorkspace} from '../command/context';
import {formatMarkdownish} from '../utils/format';
import {memoize} from '../utils/memoize';
import type {CompiledSchema} from '../utils/schema-registry';
import {isEnum} from '../utils/typanion';

// We are handling proxies here, and structuredClone doesn't support proxies
function cloneJson<T extends JsonValue>(value: T): T {
	return JSON.parse(JSON.stringify(value));
}

const isJsonEqualCache = new WeakMap<
	JsonObject | JsonValue[],
	{
		equal: WeakSet<JsonObject | JsonValue[]>;
		unequal: WeakSet<JsonObject | JsonValue[]>;
	}
>();

/**
 * Check whether the two JSON values are identical
 *
 * This function doesn't take property order in objects into account,
 * but the order in arrays does matter.
 */
function isJsonEqual(
	target: JsonValue | undefined,
	source: JsonValue | undefined,
): boolean {
	if (
		typeof target !== 'object' ||
		target == null ||
		typeof source !== 'object' ||
		source == null
	) {
		return target === source;
	}

	let cached = isJsonEqualCache.get(target);
	if (cached == null) {
		cached = {
			equal: new WeakSet(),
			unequal: new WeakSet(),
		};
		isJsonEqualCache.set(target, cached);
	}
	const cacheResult = (r: boolean) => {
		(r ? cached!.equal : cached!.unequal).add(source);
		return r;
	};

	if (cached.equal.has(source)) {
		return true;
	}
	if (cached.unequal.has(source)) {
		return false;
	}

	if (Array.isArray(target) || Array.isArray(source)) {
		if (!Array.isArray(target) || !Array.isArray(source)) {
			return cacheResult(false);
		}

		if (target.length !== source.length) {
			return cacheResult(false);
		}

		// Target might be a proxy, in which case we don't currently have access to
		// array methods, so call source.every and not target.every
		return cacheResult(source.every((el, i) => isJsonEqual(target[i], el)));
	}

	const targetProps = new Set(Object.keys(target));
	const sourceProps = Object.keys(source);

	if (sourceProps.length !== targetProps.size) {
		return cacheResult(false);
	}

	return cacheResult(
		sourceProps.every(
			prop => targetProps.has(prop) && isJsonEqual(target[prop], source[prop]),
		),
	);
}

interface ApplyChange {
	(change: 'modify' | 'add', path: JsonPropertyPath, value: JsonValue): void;
	(change: 'delete', path: JsonPropertyPath): void;
}

// Implement our own buildJsonPointer / parseJsonPointer functions here to
// prevent from importing @angular-devkit/core because that package is huge so
// we would have to lazy load it.

function pathToPointer(path: JsonPropertyPath): json.schema.JsonPointer {
	return ('/' +
		path
			.map(entry => String(entry).replace(/~/g, '~0').replace(/\//g, '~1'))
			.join('/')) as json.schema.JsonPointer;
}

function pointerToPath(pointer: json.schema.JsonPointer): JsonPropertyPath {
	return pointer
		.slice(1)
		.split('/')
		.map(entry => entry.replace(/~1/g, '/').replace(/~0/g, '~'));
}

function createChangeApplier(
	target: JsonObject | JsonValue[],
	appliedAliases?: Map<json.schema.JsonPointer, json.schema.JsonPointer>,
): ApplyChange {
	if (appliedAliases == null) {
		return (
			change: 'modify' | 'add' | 'delete',
			path: JsonPropertyPath,
			value?: JsonValue,
		) => {
			let currentTarget = target;
			while (path.length > 1) {
				const key = path.shift()!;
				currentTarget = (currentTarget as JsonObject)[key] as JsonObject;
			}

			if (change === 'delete') {
				if (isJsonArray(currentTarget)) {
					currentTarget.splice(+path[0]!, 1);
				} else {
					delete currentTarget[path[0]!];
				}
			} else {
				(currentTarget as JsonObject)[path[0]!] = value!;
			}
		};
	}

	// It's important that we take a copy of the alias map here, because there's
	// only one map that tracks all aliases -> the aliases might get overwritten
	// later on
	const reverseAliases = new Map(
		Array.from(appliedAliases, ([original, alias]) => [alias, original]),
	);

	return (
		change: 'modify' | 'add' | 'delete',
		path: JsonPropertyPath,
		value?: JsonValue,
	) => {
		let pointer = pathToPointer(path);
		{
			let changed = true;
			while (changed) {
				changed = false;

				for (const [alias, original] of reverseAliases) {
					if (alias === pointer) {
						pointer = original;
						changed = true;
						break;
					}

					if (pointer.startsWith(`${alias}/`)) {
						pointer = `${original}${pointer.slice(
							alias.length,
						)}` as typeof pointer;
						changed = true;
						break;
					}
				}
			}
			path = pointerToPath(pointer);
		}

		let currentTarget = target;
		while (path.length > 1) {
			const key = path.shift()!;
			currentTarget = (currentTarget as JsonObject)[key] as JsonObject;
		}

		if (change === 'delete') {
			if (isJsonArray(currentTarget)) {
				currentTarget.splice(+path[0]!, 1);
			} else {
				delete currentTarget[path[0]!];
			}
		} else {
			(currentTarget as JsonObject)[path[0]!] = value!;
		}
	};
}

function merge(
	applyChange: ApplyChange,
	target: JsonValue,
	source: JsonValue,
	path: JsonPropertyPath = [],
) {
	if (isJsonEqual(target, source)) {
		return;
	}

	if (target == null || source == null) {
		if (target != null || source != null) {
			applyChange('modify', path, source);
		}

		return;
	}

	if (isJsonArray(target)) {
		if (!isJsonArray(source)) {
			return applyChange('modify', path, source);
		}

		// TODO be smarter about this, e.g. when an item is inserted in the middle
		// of the array...

		if (target.length <= source.length) {
			for (const [i, t] of target.entries()) {
				merge(applyChange, t, source[i]!, [...path, i]);
			}

			for (let i = target.length; i < source.length; i++) {
				applyChange('add', [...path, i], source[i]!);
			}
		} else {
			// TODO
			applyChange('modify', path, source);
		}

		return;
	}

	if (isJsonObject(target)) {
		if (!isJsonObject(source)) {
			return applyChange('modify', path, source);
		}

		const sourceKeys = new Set(Object.keys(source));
		const targetKeys = new Set(Object.keys(target));

		for (const key of targetKeys) {
			if (!sourceKeys.has(key)) {
				applyChange('delete', [...path, key]);
				continue;
			}

			merge(applyChange, target[key]!, source[key]!, [...path, key]);
		}

		for (const key of sourceKeys) {
			if (!targetKeys.has(key)) {
				applyChange('add', [...path, key], source[key]!);
			}
		}

		return;
	}

	if (target !== source) {
		applyChange('modify', path, source);
	}
}

export class SyncConfigToCommand extends AbstractCommand {
	static override readonly paths = [['--sync-config']];

	static override readonly usage = AbstractCommand.Usage({
		category: 'Utility commands',
		description: 'Sync config from one format to another',
		details: `
			This command syncs the configuration of this workspace to
			another workspace configuration format.

			Syncing configurations allows for e.g. using the more human
			friendly KDL language format to actually manage the workspace
			configuration, but keep this configuration in sync with
			\`workspace.json\` for \`nx\` or \`angular.json\` for \`ng\`
			to support using those CLI tools in the workspace.

			Adding the \`--validate\` option validates the output
			configuration instead of updating it. Use this to ensure
			that the multiple copies of configuration don't go out of
			sync.

			**Behavior**

			Because of this very specific use case this command
			specifically makes only few guarantees:

			- The \`sn\` command will interpret both the current configuration file and the output file as identical
			- The output file correctly implements the format described by the corresponding CLI tool (whether \`sn\`, \`ng\` or \`ng\`)
			- The \`--validate\` option compares the data, not the file content, so running the output file through a formatter like prettier is safe.
			
			This command very explicitly comes with the following limitations:

			- The output file is overwritten entirely, any changes made to that file will be removed.
			- Only the configuration is written, metadata such as formatting or comments will not be retained.
			- The output file is normalized. For example, \`angular.json\` supports both the "targets" and "architect" property to define targets, this command picks one regardless of what the file originally contained.
			- There's no support for writing split configuration files.
		`,
		examples: [
			[
				'Write the project configuration to `angular.json` to allow using `ng` in the workspace',
				`$0 --sync-config --to angular.json`,
			],
			[
				'Validate the project configuration in `angular.json` to ensure the configuration in that file is in sync with the "real" configuration file',
				`$0 --sync-config --to angular.json --validate`,
			],
			[
				'Merge the configuration from angular.json to workspace.json, e.g. to sync after an angular schematic modified the configuration',
				`$0 --sync-config --from angular.json --merge --to workspace.json`,
			],
		],
	});

	validate = Option.Boolean('--validate', false, {
		description: 'Validate the existing output file instead of updating it',
	});

	merge = Option.Boolean('--merge', false, {
		description:
			'Merge changes into existing target file instead of overwriting',
	});

	source = Option.String('--from', {
		description:
			'The configuration file to use as source, defaults to the active workspace configuration',
		validator: isEnum(workspaceFilenames),
	});

	target = Option.String('--to', {
		required: true,
		validator: isEnum(workspaceFilenames),
	});

	async execute(): Promise<number> {
		const {
			report,
			workspace: {workspaceFolder, workspaceFilename},
		} = this;

		const sourceName = this.source ?? workspaceFilename;
		const source = this.source
			? new CliWorkspace(
					await readWorkspace(join(workspaceFolder, this.source)),
					join(workspaceFolder, this.source),
			  )
			: this.workspace;

		if (this.validate || this.merge) {
			let isValid = true;
			const host = this.validate
				? {
						...nodeFsHost,
						async write(path: string) {
							report.reportError(`Configuration file ${path} is out of sync`);
							isValid = false;
						},
				  }
				: nodeFsHost;

			await updateWorkspace(
				join(workspaceFolder, this.target),
				async target => {
					await this.#sync(
						new CliWorkspace(target, join(workspaceFolder, this.target)),
						source,
					);
				},
				{host},
			);

			if (!isValid) {
				report.reportInfo(
					formatMarkdownish(
						`Run \`${this.cli.binaryName} ${this.context.startArgs
							.filter(arg => arg !== '--validate')
							.join(' ')}\` to update`,
						{format: this.format, maxLineLength: Infinity},
					),
				);

				return 1;
			}

			if (report.numberOfErrors > 0) {
				report.reportWarning(
					`Merged the workspace in ${sourceName} into ${this.target}, ignoring parts of the file due to errors logged above`,
				);
				return 1;
			}

			report.reportInfo(
				`Successfully merged the workspace in ${sourceName} into ${this.target}`,
			);
			return 0;
		}

		const target = new CliWorkspace(
			{
				extensions: {},
				projects: new ProjectDefinitionCollection(),
			},
			join(workspaceFolder, this.target),
		);

		await this.#sync(target, source);

		await writeWorkspace(join(workspaceFolder, this.target), target, {
			header: [
				`This file was generated from ${sourceName} using \`sn --sync-config-to ${this.target}\``,
				'Make changes to the original configuration file and re-run the command to regenerate this file,',
				'otherwise your changes might get lost the next time the configuration is synced.',
			],
		});

		if (report.numberOfErrors > 0) {
			report.reportWarning(
				`Copied the workspace in ${sourceName} to ${this.target}, ignoring parts of the file due to errors logged above`,
			);
			return 1;
		}

		report.reportInfo(
			`Successfully copied the workspace in ${sourceName} to ${this.target}`,
		);
		return 0;
	}

	async #sync(target: CliWorkspace, source: CliWorkspace) {
		const appliedAliases = new Map<
			json.schema.JsonPointer,
			json.schema.JsonPointer
		>();
		const {report} = this;
		const [architectHost, workflow, sourceRegistry, targetRegistry] =
			await Promise.all([
				this.architectHost,
				this.createEngineHost(target.workspaceFolder, false).then(engineHost =>
					this.createWorkflow(engineHost, target.workspaceFolder, false, true),
				),
				this.createSchemaRegistry({
					workspace: source,
				}),
				this.createSchemaRegistry({
					workspace: target,
					appliedAliases,
				}),
			]);

		const getCompiledArchitectSchemas = memoize(
			async (
				builder: string,
			): Promise<
				| [sourceSchema: CompiledSchema, targetSchema: CompiledSchema]
				| [null, null]
			> => {
				let builderInfo;
				try {
					builderInfo = await architectHost.resolveBuilder(builder);
				} catch {
					return [null, null];
				}

				return await Promise.all([
					sourceRegistry.compile(builderInfo.optionSchema).toPromise(),
					targetRegistry.compile(builderInfo.optionSchema).toPromise(),
				]);
			},
		);

		const getCompiledSchematicSchemas = memoize(
			async (
				name: string,
			): Promise<
				[source: CompiledSchema, target: CompiledSchema] | [null, null]
			> => {
				const [collectionName, schematicName] = name.split(':', 2) as [
					string,
					string,
				];

				let schematic;
				try {
					schematic = workflow.engine
						.createCollection(collectionName)
						.createSchematic(schematicName);
				} catch {
					return [null, null];
				}

				return await Promise.all([
					sourceRegistry
						.compile(schematic.description.schemaJson || true)
						.toPromise(),
					targetRegistry
						.compile(schematic.description.schemaJson || true)
						.toPromise(),
				]);
			},
		);

		processExtensions('in workspace', target.extensions, source.extensions);

		for (const name of target.projects.keys()) {
			if (!source.projects.has(name)) {
				target.projects.delete(name);
			}
		}

		for (const [name, sourceProject] of source.projects) {
			let targetProject = target.projects.get(name);
			if (targetProject == null) {
				targetProject = target.projects.add({
					...cloneJson(sourceProject.extensions),
					name,
					root: sourceProject.root,
					prefix: sourceProject.prefix,
					sourceRoot: sourceProject.sourceRoot,
				});
			} else {
				if (targetProject.root !== sourceProject.root) {
					targetProject.root = sourceProject.root;
				}
				if (targetProject.sourceRoot !== sourceProject.sourceRoot) {
					targetProject.sourceRoot = sourceProject.sourceRoot;
				}
				if (targetProject.prefix !== sourceProject.prefix) {
					targetProject.prefix = sourceProject.prefix;
				}

				processExtensions(
					`in project ${name}`,
					targetProject.extensions,
					sourceProject.extensions,
				);
			}

			for (const targetName of targetProject.targets.keys()) {
				if (!sourceProject.targets.has(targetName)) {
					targetProject.targets.delete(targetName);
				}
			}

			for (const [targetName, sourceTarget] of sourceProject.targets) {
				const [compiledSourceSchema, compiledTargetSchema] =
					await getCompiledArchitectSchemas(sourceTarget.builder);
				if (compiledSourceSchema == null || compiledTargetSchema == null) {
					this.report.reportError(
						`Failed to resolve builder ${JSON.stringify(
							sourceTarget.builder,
						)} for target ${JSON.stringify(
							sourceTarget,
						)} in project ${JSON.stringify(
							sourceProject,
						)}, skipping this target`,
					);
					continue;
				}

				let targetTarget = targetProject.targets.get(targetName);
				if (targetTarget == null) {
					targetTarget = targetProject.targets.add({
						...cloneJson(sourceTarget.extensions),
						name: targetName,
						builder: sourceTarget.builder,
						// TODO figure out how not to need ! in the following properties
						defaultConfiguration: sourceTarget.defaultConfiguration!,
					});
				} else {
					if (targetTarget.builder !== sourceTarget.builder) {
						targetTarget.builder = sourceTarget.builder;
					}
					if (
						targetTarget.defaultConfiguration !==
						sourceTarget.defaultConfiguration
					) {
						targetTarget.defaultConfiguration =
							sourceTarget.defaultConfiguration;
					}

					processExtensions(
						`in target ${targetName} of project ${name}`,
						targetTarget.extensions,
						sourceTarget.extensions,
					);
				}

				if (sourceTarget.options === undefined) {
					if (targetTarget.options !== undefined) {
						targetTarget.options = undefined;
					}
				} else {
					const processedSourceOptions =
						(await compiledSourceSchema.applyPreTransforms(
							cloneJson(sourceTarget.options),
						)) as JsonObject;

					if (targetTarget.options === undefined) {
						targetTarget.options = processedSourceOptions;
					} else {
						appliedAliases.clear();
						const processedTargetOptions =
							(await compiledTargetSchema.applyPreTransforms(
								cloneJson(targetTarget.options),
							)) as JsonObject;

						merge(
							createChangeApplier(targetTarget.options, appliedAliases),
							processedTargetOptions,
							processedSourceOptions,
						);
					}
				}

				if (sourceTarget.configurations === undefined) {
					if (targetTarget.configurations !== undefined) {
						targetTarget.configurations = undefined;
					}
				} else {
					const processedSourceConfigurations = Object.fromEntries(
						await Promise.all(
							Object.entries(sourceTarget.configurations).map(
								async ([configurationName, configuration]) =>
									[
										configurationName,
										(await compiledSourceSchema.applyPreTransforms(
											cloneJson(configuration),
										)) as JsonObject,
									] as const,
							),
						),
					);

					if (targetTarget.configurations === undefined) {
						targetTarget.configurations = processedSourceConfigurations;
					} else {
						const sourceConfigurations = new Map(
							Object.entries(processedSourceConfigurations),
						);
						const targetConfigurations = new Map(
							Object.entries(targetTarget.configurations),
						);

						for (const configurationName of targetConfigurations.keys()) {
							if (!sourceConfigurations.has(configurationName)) {
								delete targetTarget.configurations[configurationName];
							}
						}

						for (const [
							configurationName,
							sourceConfiguration,
						] of sourceConfigurations) {
							if (!targetConfigurations.has(configurationName)) {
								targetTarget.configurations[configurationName] =
									sourceConfiguration;
								continue;
							}

							const targetConfiguration =
								targetConfigurations.get(configurationName)!;
							appliedAliases.clear();
							const processedTargetConfiguration =
								(await compiledTargetSchema.applyPreTransforms(
									cloneJson(targetConfiguration),
								)) as JsonObject;

							merge(
								createChangeApplier(targetConfiguration, appliedAliases),
								processedTargetConfiguration,
								sourceConfiguration,
							);
						}
					}
				}
			}
		}

		async function processExtensions(
			where: string,
			target: JsonObject,
			source: JsonObject,
		) {
			const targetKeys = new Set(Object.keys(target));
			const sourceKeys = new Set(Object.keys(source));

			if (where === 'in workspace') {
				targetKeys.delete('version');
				sourceKeys.delete('version');
			}

			for (const key of targetKeys) {
				if (!sourceKeys.has(key)) {
					delete target[key];
				}
			}

			for (const key of sourceKeys) {
				if (key !== 'schematics' || !isJsonObject(source[key])) {
					merge(createChangeApplier(target), target[key]!, source[key]!, [key]);
					continue;
				}

				const processedSourceSchematics = Object.fromEntries(
					await Promise.all(
						Array.from(
							Object.entries(source[key]!),
							async ([collectionOrName, config]): Promise<
								[string, JsonObject]
							> => {
								if (!isJsonObject(config)) {
									return [collectionOrName, config];
								}

								if (collectionOrName.includes(':')) {
									const [compiledSchema] = await getCompiledSchematicSchemas(
										collectionOrName,
									);
									if (compiledSchema == null) {
										report.reportError(
											`Failed to resolve schematic ${JSON.stringify(
												collectionOrName,
											)} ${where}, skipping this configuration`,
										);
										return [collectionOrName, config];
									} else {
										return [
											collectionOrName,
											(await compiledSchema.applyPreTransforms(
												cloneJson(config),
											)) as JsonObject,
										];
									}
								}

								return [
									collectionOrName,
									Object.fromEntries(
										await Promise.all(
											Array.from(
												Object.entries(config),
												async ([schematicName, schematicConfig]) => {
													if (!isJsonObject(schematicConfig)) {
														return [schematicName, schematicConfig];
													}

													const [compiledSchema] =
														await getCompiledSchematicSchemas(
															`${collectionOrName}:${schematicName}`,
														);
													if (compiledSchema == null) {
														report.reportError(
															`Failed to resolve schematic ${JSON.stringify(
																schematicName,
															)} in collection ${JSON.stringify(
																collectionOrName,
															)} ${where}, skipping this configuration`,
														);
														return [schematicName, schematicConfig];
													} else {
														return [
															schematicName,
															await compiledSchema.applyPreTransforms(
																cloneJson(config),
															),
														];
													}
												},
											),
										),
									),
								];
							},
						),
					),
				);

				const targetSchematics = target[key];
				if (!isJsonObject(targetSchematics)) {
					target[key] = processedSourceSchematics;
					continue;
				}

				for (const collectionOrName of Object.keys(targetSchematics)) {
					if (processedSourceSchematics[collectionOrName] == null) {
						delete targetSchematics[collectionOrName];
					}
				}

				for (const [collectionOrName, sourceOptions] of Object.entries(
					processedSourceSchematics,
				)) {
					const targetOptions = targetSchematics[collectionOrName];
					if (!isJsonObject(targetOptions)) {
						targetSchematics[collectionOrName] = sourceOptions;
						continue;
					}

					if (collectionOrName.includes(':')) {
						const [, compiledSchema] = await getCompiledSchematicSchemas(
							collectionOrName,
						);

						appliedAliases.clear();
						const processedTargetOptions = compiledSchema
							? ((await compiledSchema.applyPreTransforms(
									cloneJson(targetOptions),
							  )) as JsonObject)
							: targetOptions;

						merge(
							createChangeApplier(targetOptions, appliedAliases),
							processedTargetOptions,
							sourceOptions,
						);
					}

					for (const schematicName of Object.keys(targetOptions)) {
						if (sourceOptions[schematicName] == null) {
							delete targetOptions[schematicName];
						}
					}

					for (const [schematicName, sourceSchematicConfig] of Object.entries(
						sourceOptions,
					)) {
						const targetSchematicConfig = targetOptions[schematicName];
						if (
							!isJsonObject(sourceSchematicConfig) ||
							!isJsonObject(targetSchematicConfig)
						) {
							targetOptions[schematicName] = sourceSchematicConfig;
							continue;
						}

						const [, compiledSchema] = await getCompiledSchematicSchemas(
							`${collectionOrName}:${schematicName}`,
						);

						appliedAliases.clear();
						const processedTargetSchematicConfig = compiledSchema
							? ((await compiledSchema.applyPreTransforms(
									cloneJson(targetSchematicConfig),
							  )) as JsonObject)
							: targetSchematicConfig;

						merge(
							createChangeApplier(targetOptions, appliedAliases),
							processedTargetSchematicConfig,
							sourceSchematicConfig,
						);
					}
				}
			}
		}
	}
}
