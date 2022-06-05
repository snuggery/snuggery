import type {
	Architect,
	BuilderOutput,
	BuilderRun,
	Target,
} from '@angular-devkit/architect';
import {isJsonArray, JsonObject} from '@snuggery/core';
import {promises as fs} from 'fs';
import {tmpdir} from 'os';
import {join} from 'path';

import {AbstractError} from '../../utils/error';
import type {SnuggeryArchitectHost} from '../architect';
import {Cached} from '../utils/decorator';
import {Option, parseSchema, Type} from '../utils/parse-schema';

import {AbstractCommand} from './abstract-command';
import type {Context} from './context';

/**
 * Architect commands share a `--configuration` / `-c` option
 */
export const configurationOption: Option = {
	name: 'configuration',
	aliases: ['c'],
	hidden: false,
	required: false,
	type: Type.StringArray,
	description: 'Configuration(s) to use',
};

export class BuilderFailedError extends AbstractError {}

async function handleBuilderRun(run: BuilderRun, context: Context) {
	let result: BuilderOutput;
	try {
		result = await run.output.toPromise();

		await run.stop();
	} catch (e) {
		if (!(e instanceof Error)) {
			throw new BuilderFailedError(
				`Builder failed with non-error: ${JSON.stringify(e)}`,
			);
		}

		let message = `Build failed with underlying ${e.name}: ${e.message}`;

		if (e.stack) {
			const file = join(
				await fs.mkdtemp(join(tmpdir(), 'snuggery-')),
				'error.log',
			);
			await fs.writeFile(file, e.stack);

			message += `\nSee ${file} for more information on the error`;
		}

		throw new BuilderFailedError(message);
	}

	if (result == null) {
		context.report.reportWarning(
			'Builder exited without emitting a value, assuming success',
		);
		result = {success: true};
	}

	if (result.error) {
		context.report.reportError(result.error);
	}

	return result.success ? 0 : 1;
}

export function addConfigurationsToTarget(
	target: Target,
	options: JsonObject,
	initialConfigurations: ReadonlySet<string>,
): Target {
	const configurations = new Set(initialConfigurations);

	if (typeof options.configuration === 'string') {
		for (const value of options.configuration
			.split(',')
			.map(configuration => configuration.trim())) {
			if (value) {
				configurations.add(value);
			}
		}
		delete options.configuration;
	} else if (isJsonArray(options.configuration)) {
		for (const value of options.configuration) {
			if (typeof value === 'string') {
				configurations.add(value.trim());
			}
		}
		delete options.configuration;
	}

	if (configurations.size === 0) {
		return target;
	}

	return {
		...target,
		configuration: Array.from(configurations).join(','),
	};
}

export abstract class ArchitectCommand extends AbstractCommand {
	@Cached()
	protected get architectHost(): Promise<SnuggeryArchitectHost> {
		return import('../architect/index.js').then(({createArchitectHost}) =>
			createArchitectHost(this.context, this.context.workspace),
		);
	}

	@Cached()
	get architect(): Promise<Architect> {
		return Promise.all([
			this.architectHost,
			this.createSchemaRegistry(),
			import('@angular-devkit/architect'),
		]).then(([host, registry, {Architect}]) => new Architect(host, registry));
	}

	/**
	 * The default project, if any
	 */
	@Cached()
	protected get defaultProject(): string | null {
		const defaultProject = this.context.workspace?.extensions?.defaultProject;

		if (typeof defaultProject === 'string') {
			return defaultProject;
		}

		return null;
	}

	/**
	 * A map that maps unique target names onto the single projects that contain them
	 */
	@Cached()
	protected get uniqueTargets(): ReadonlyMap<string, string> {
		const allTargets = new Map<string, string>();
		const nonUniqueTargets = new Set<string>();

		for (const [project, {targets}] of this.context.workspace?.projects || []) {
			for (const target of targets.keys()) {
				if (allTargets.has(target)) {
					nonUniqueTargets.add(target);
				} else {
					allTargets.set(target, project);
				}
			}
		}

		return new Map(
			Array.from(allTargets).filter(
				([target]) => !nonUniqueTargets.has(target),
			),
		);
	}

	/**
	 * Set of configurations activated upon the command class itself
	 */
	protected getConfigurations(
		this: ArchitectCommand & {configuration?: string[]},
	): Set<string> {
		return new Set(
			this.configuration
				?.flatMap(c => c.split(','))
				.map(configuration => configuration.trim()),
		);
	}

	/**
	 * Return the option definitions for the given target
	 */
	protected async getOptionsForTarget(target: Target): Promise<{
		options: Option[];
		allowExtraOptions: boolean;
		description?: string | undefined;
	}> {
		return this.getOptionsForBuilder(
			await (await this.architectHost).getBuilderNameForTarget(target),
		);
	}

	/**
	 * Return the option definitions for the given builder
	 */
	protected async getOptionsForBuilder(builderConf: string): Promise<{
		options: Option[];
		allowExtraOptions: boolean;
		description?: string | undefined;
	}> {
		const {description, optionSchema} = await (
			await this.architectHost
		).resolveBuilder(builderConf);

		return parseSchema({
			description,
			schema: optionSchema,
		});
	}

	protected async runTarget({
		target,
		options = {},
	}: {
		target: Target;
		options?: JsonObject;
	}): Promise<number> {
		return handleBuilderRun(
			await (
				await this.architect
			).scheduleTarget(target, options, {
				logger: await this.logger,
			}),
			this.context,
		);
	}

	protected async runBuilder({
		builder,
		options = {},
	}: {
		builder: string;
		options?: JsonObject;
	}): Promise<number> {
		return handleBuilderRun(
			await (
				await this.architect
			).scheduleBuilder(builder, options, {
				logger: await this.logger,
			}),
			this.context,
		);
	}

	protected async resolveTarget(
		target: string,
		projectName: string | null,
	): Promise<Target> {
		if (projectName != null) {
			return {project: projectName, target};
		}

		const {currentProject, workspace} = this;

		if (currentProject != null) {
			const project = workspace.getProjectByName(currentProject);
			if (project.targets.has(target)) {
				return {project: currentProject, target};
			}
		}

		const {defaultProject} = this;

		if (typeof defaultProject === 'string') {
			const project = workspace.tryGetProjectByName(defaultProject);

			if (project == null) {
				this.context.report.reportWarning(
					`Couldn't find configured default project ${JSON.stringify(
						defaultProject,
					)} in the workspace`,
				);
			} else if (project.targets.has(target)) {
				return {project: defaultProject, target};
			}
		}

		const {uniqueTargets} = this;

		if (uniqueTargets.has(target)) {
			return {project: uniqueTargets.get(target)!, target};
		}

		const {UnknownTargetError} = await import('../architect/index.js');
		throw new UnknownTargetError(
			`Failed to resolve target ${JSON.stringify(
				target,
			)}, try passing a project name`,
		);
	}
}
