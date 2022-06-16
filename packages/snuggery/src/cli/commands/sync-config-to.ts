import type {JsonObject, JsonValue} from '@angular-devkit/core';
import {
	isJsonObject,
	ProjectDefinitionCollection,
	readWorkspace,
	WorkspaceDefinition,
	workspaceFilenames,
	writeWorkspace,
} from '@snuggery/core';
import {Option} from 'clipanion';
import {join} from 'path';

import {AbstractCommand} from '../command/abstract-command';
import {formatMarkdownish} from '../utils/format';
import {memoize} from '../utils/memoize';
import type {CompiledSchema} from '../utils/schema-registry';
import {isEnum} from '../utils/typanion';

// TODO Not sure how structureClone holds up when using proxies
function cloneJson<T extends JsonValue>(value: T): T {
	return JSON.parse(JSON.stringify(value));
}

/**
 * Checks whether the two JSON values are identical
 *
 * This function doesn't take property order in objects into account,
 * but the order in arrays does matter.
 */
function isJsonEqual(
	a: JsonValue | undefined,
	b: JsonValue | undefined,
): boolean {
	if (typeof a !== typeof b) {
		return false;
	}

	if (
		typeof a !== 'object' ||
		a == null ||
		typeof b !== 'object' ||
		b == null
	) {
		return a === b;
	}

	if (Array.isArray(a) || Array.isArray(b)) {
		if (!Array.isArray(a) || !Array.isArray(b)) {
			return false;
		}

		if (a.length !== b.length) {
			return false;
		}

		return a.every((el, i) => isJsonEqual(el, b[i]));
	}

	const aProps = new Set(Object.keys(a));
	const bProps = Object.keys(b);

	if (bProps.length !== aProps.size) {
		return false;
	}

	return bProps.every(
		prop => aProps.has(prop) && isJsonEqual(a[prop], b[prop]),
	);
}

export class SyncConfigToCommand extends AbstractCommand {
	static override readonly paths = [['--sync-config-to']];

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
				`$0 --sync-config-to angular.json`,
			],
			[
				'Validate the project configuration in `angular.json` to ensure the configuration in that file is in sync with the "real" configuration file',
				`$0 --sync-config-to angular.json --validate`,
			],
		],
	});

	validate = Option.Boolean(`--validate`, {
		description: 'Validate the existing output file instead of updating it',
	});

	output = Option.String({
		required: true,
		validator: isEnum(workspaceFilenames),
	});

	async execute(): Promise<number> {
		const {workspace, report} = this;

		const clone: WorkspaceDefinition = {
			extensions: cloneJson(workspace.extensions),

			projects: new ProjectDefinitionCollection(),
		};

		delete clone.extensions.version;

		await this.#copyProjects(clone);
		await this.#updateSchematics(clone);

		if (this.validate) {
			if (await this.#isValid(clone)) {
				report.reportInfo(`The workspace file at ${this.output} is in sync`);
				return 0;
			} else {
				report.reportError(
					formatMarkdownish(
						`The workspace file at ${this.output} is out of sync, run \`${this.cli.binaryName} --sync-config-to ${this.output}\` to update`,
						{format: this.format, maxLineLength: Infinity},
					),
				);
				return 1;
			}
		}

		await writeWorkspace(join(workspace.workspaceDir, this.output), clone);

		if (report.numberOfErrors > 0) {
			report.reportWarning(
				`Copied the workspace in ${workspace.workspaceFilename} to ${this.output}, ignoring parts of the file due to errors logged above`,
			);
			return 1;
		}

		report.reportInfo(
			`Successfully copied the workspace in ${workspace.workspaceFilename} to ${this.output}`,
		);
		return 0;
	}

	async #copyProjects(clone: WorkspaceDefinition) {
		const [architectHost, registry] = await Promise.all([
			this.architectHost,
			this.architectSchemaRegistry,
		]);

		const getCompiledSchema = memoize(
			async (builder: string): Promise<CompiledSchema | null> => {
				try {
					const builderInfo = await architectHost.resolveBuilder(builder);
					return await registry.compile(builderInfo.optionSchema).toPromise();
				} catch {
					return null;
				}
			},
		);

		for (const [name, project] of this.workspace.projects) {
			const cloneProject = clone.projects.add({
				...cloneJson(project.extensions),
				name,
				root: project.root,
				prefix: project.prefix,
				sourceRoot: project.sourceRoot,
			});

			for (const [targetName, target] of project.targets) {
				const compiledSchema = await getCompiledSchema(target.builder);
				if (compiledSchema == null) {
					this.report.reportError(
						`Failed to resolve builder ${JSON.stringify(
							target.builder,
						)} for target ${JSON.stringify(target)} in project ${JSON.stringify(
							project,
						)}, skipping this target`,
					);
					continue;
				}

				cloneProject.targets.add({
					...cloneJson(target.extensions),
					name: targetName,
					builder: target.builder,
					// TODO figure out how not to need ! in the following properties
					defaultConfiguration: target.defaultConfiguration!,

					options:
						target.options! &&
						((await compiledSchema.applyPreTransforms(
							target.options,
						)) as JsonObject),
					configurations:
						target.configurations! &&
						Object.fromEntries(
							await Promise.all(
								Object.entries(target.configurations).map(
									async ([name, configuration]) =>
										[
											name,
											(await compiledSchema!.applyPreTransforms(
												configuration,
											)) as JsonObject,
										] as const,
								),
							),
						),
				});
			}
		}
	}

	async #updateSchematics(clone: WorkspaceDefinition) {
		const registry = await this.schematicsSchemaRegistry;
		const engineHost = await this.createEngineHost(
			this.workspace.workspaceDir,
			false,
		);
		const workflow = await this.createWorkflow(
			engineHost,
			this.workspace.workspaceDir,
			false,
			false,
		);

		const getCompiledSchema = memoize(
			async (name: string): Promise<CompiledSchema | null> => {
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
					return null;
				}

				return await registry
					.compile(schematic.description.schemaJson || true)
					.toPromise();
			},
		);

		const processExtensions = async (where: string, extensions: JsonObject) => {
			if (!isJsonObject(extensions.schematics)) {
				return;
			}

			for (const [collectionOrName, config] of Object.entries(
				extensions.schematics,
			)) {
				if (!isJsonObject(config)) {
					continue;
				}

				if (collectionOrName.includes(':')) {
					const compiledSchema = await getCompiledSchema(collectionOrName);
					if (compiledSchema == null) {
						this.report.reportError(
							`Failed to resolve schematic ${JSON.stringify(
								collectionOrName,
							)} ${where}, skipping this configuration`,
						);
						delete extensions.schematics[collectionOrName];
					} else {
						extensions.schematics[collectionOrName] =
							await compiledSchema.applyPreTransforms(config);
					}
					return;
				}

				for (const [schematicName, schematicConfig] of Object.entries(config)) {
					if (!isJsonObject(schematicConfig)) {
						continue;
					}

					const compiledSchema = await getCompiledSchema(
						`${collectionOrName}:${schematicName}`,
					);
					if (compiledSchema == null) {
						this.report.reportError(
							`Failed to resolve schematic ${JSON.stringify(
								schematicName,
							)} in collection ${JSON.stringify(
								collectionOrName,
							)} ${where}, skipping this configuration`,
						);
						delete extensions.schematics[collectionOrName];
					} else {
						extensions.schematics[collectionOrName] =
							await compiledSchema.applyPreTransforms(config);
					}
				}
			}
		};

		await processExtensions('in the workspace', clone.extensions);
		for (const [name, project] of clone.projects) {
			await processExtensions(
				`in project ${JSON.stringify(name)}`,
				project.extensions,
			);
		}
	}

	async #isValid(clone: WorkspaceDefinition): Promise<boolean> {
		const workspace = await readWorkspace(
			join(this.workspace.workspaceDir, this.output),
		);

		if (
			!isJsonEqual(clone.extensions, workspace.extensions) ||
			clone.projects.size !== workspace.projects.size
		) {
			return false;
		}

		for (const [projectName, cloneProject] of clone.projects) {
			const project = workspace.projects.get(projectName);
			if (project == null) {
				return false;
			}

			if (
				project.root !== cloneProject.root ||
				project.prefix !== cloneProject.prefix ||
				project.sourceRoot !== cloneProject.sourceRoot ||
				!isJsonEqual(project.extensions, cloneProject.extensions) ||
				project.targets.size !== cloneProject.targets.size
			) {
				return false;
			}

			for (const [targetName, cloneTarget] of cloneProject.targets) {
				const target = project.targets.get(targetName);
				if (target == null) {
					return false;
				}

				if (
					target.builder !== cloneTarget.builder ||
					target.defaultConfiguration !== cloneTarget.defaultConfiguration ||
					!isJsonEqual(target.options, cloneTarget.options) ||
					!isJsonEqual(target.configurations, cloneTarget.configurations) ||
					!isJsonEqual(target.extensions, cloneTarget.extensions)
				) {
					return false;
				}
			}
		}

		return true;
	}
}
