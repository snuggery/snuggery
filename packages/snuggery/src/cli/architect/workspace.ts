import type {createBuilder, Target} from '@angular-devkit/architect';
import type {Executor} from '@nrwl/devkit';
import type {
	JsonObject,
	ProjectDefinition,
	TargetDefinition,
} from '@snuggery/core';

import type {CliWorkspace} from '../command/context';
import {makeExecutorIntoBuilder} from '../utils/tao';

import {UnknownConfigurationError, UnknownTargetError} from './errors';
import type {WorkspaceFacade} from './host';

export class CliWorkspaceFacade implements WorkspaceFacade {
	readonly #workspace: CliWorkspace | null;
	constructor(workspace: CliWorkspace | null = null) {
		this.#workspace = workspace;
	}

	public get basePath(): string | undefined {
		return this.#workspace?.workspaceDir;
	}

	getProject(projectName: string): ProjectDefinition {
		const project = this.#workspace?.projects.get(projectName);

		if (project == null) {
			throw new UnknownTargetError(`Unknown project: "${projectName}"`);
		}

		return project;
	}

	getProjectMetadata(projectName: string): JsonObject {
		const projectDefinition = this.getProject(projectName);

		return {
			root: projectDefinition.root,
			sourceRoot: projectDefinition.sourceRoot!,
			prefix: projectDefinition.prefix!,
			...projectDefinition.extensions,
		};
	}

	getTarget(target: Target): TargetDefinition {
		const projectTarget = this.getProject(target.project).targets.get(
			target.target,
		);

		if (projectTarget == null) {
			throw new UnknownTargetError(
				`No target named "${target.target}" found in project "${target.project}"`,
			);
		}

		return projectTarget;
	}

	getOptionsForTarget(target: Target): JsonObject | null {
		const targetDefinition = this.getTarget(target);
		const options: JsonObject = {};

		if (targetDefinition.options != null) {
			Object.assign(options, targetDefinition.options);
		}

		for (const configuration of (
			target.configuration ?? targetDefinition.defaultConfiguration
		)?.split(',') || []) {
			const configurationOptions =
				targetDefinition.configurations?.[configuration];

			if (configurationOptions == null) {
				throw new UnknownConfigurationError(
					`Target "${target.target}" in project "${target.project}" doesn't have a configuration named "${configuration}"`,
				);
			}

			Object.assign(options, configurationOptions);
		}

		return options;
	}

	convertExecutorIntoBuilder(
		executor: Executor,
	): ReturnType<typeof createBuilder> {
		return makeExecutorIntoBuilder(executor, this.#workspace);
	}
}
