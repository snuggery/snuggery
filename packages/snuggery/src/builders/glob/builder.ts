import {
	Target as ArchitectTarget,
	targetStringFromTarget,
} from "@angular-devkit/architect";
import {tags} from "@angular-devkit/core";
import {
	type BuilderContext,
	BuildFailureError,
	findProjects,
	findWorkspace,
	TargetSpecifier,
} from "@snuggery/architect";

import {execute as executeCombine} from "../combine/index.js";

import type {Schema} from "./schema.js";

function stringifyArray(values: string[]) {
	return values.map((value) => JSON.stringify(value)).join(", ");
}

/**
 * Execute a target in multiple projects, defined using glob patterns
 */
export async function execute(
	{
		builder,
		include,
		configuration,
		exclude,
		options,
		scheduler,
		target,
		targetOptions,
		unknownConfiguration,
		unknownTarget,
		...otherOptions
	}: Schema,
	context: BuilderContext,
): Promise<void> {
	if (builder == null && target == null) {
		if (context.target == null) {
			throw new BuildFailureError(
				`Input "target" is required when executing builder via API`,
			);
		}

		target = context.target.target;
	}

	exclude = [exclude || []].flat();
	include = [include].flat();

	if (
		context.target != null &&
		(builder != null || context.target.target === target)
	) {
		exclude.push(context.target.project);
	}

	if (isEmptyObject(options)) {
		options = undefined;
	}
	if (isEmptyObject(targetOptions)) {
		targetOptions = undefined;
	}

	const workspace = await findWorkspace(context);
	const projects = await findProjects(context, {
		workspace,
		include,
		exclude,
	});

	let targets: TargetSpecifier[];
	if (builder != null) {
		targets = projects.map((project) => ({builder, project}));
	} else {
		targets = [];
		const missingTargets: string[] = [];
		const missingConfigurations = new Map<string, string[]>();

		outer: for (const project of projects) {
			const projectDefinition = workspace!.projects.get(project)!;
			const targetDefinition = projectDefinition.targets.get(target!);

			if (targetDefinition == null) {
				if (unknownTarget !== "skip") {
					missingTargets.push(project);
				}

				continue;
			}

			const requestedConfigurations = configuration?.split(",") ?? [];
			let modified = false;
			const missingConfigurationsForProject: string[] = [];

			for (const [i, config] of requestedConfigurations.entries()) {
				if (
					targetDefinition.configurations == null ||
					!Reflect.has(targetDefinition.configurations, config)
				) {
					switch (unknownConfiguration) {
						case "skip":
							continue outer;
						case "run":
							requestedConfigurations.splice(i);
							modified = true;
							break;
						case "error":
						default:
							missingConfigurationsForProject.push(config);
					}
				}
			}

			if (missingConfigurationsForProject.length) {
				missingConfigurations.set(project, missingConfigurationsForProject);
				continue;
			}

			if (modified) {
				configuration = requestedConfigurations.join(",");
			}

			targets.push(
				targetStringFromTarget({
					project,
					target,
					configuration,
				} as ArchitectTarget),
			);
		}

		if (missingTargets.length > 0) {
			throw new BuildFailureError(
				tags.stripIndent`
					${
						missingTargets.length === 1
							? `Project ${stringifyArray(missingTargets)} does`
							: `Projects ${stringifyArray(missingTargets)} do`
					} not declare a target ${JSON.stringify(target)}.
					Set the "unknownTarget" option to "skip" to skip these projects.
				`,
			);
		}

		if (missingConfigurations.size > 0) {
			const errors = Array.from(missingConfigurations, ([project, configs]) => {
				return `Project ${JSON.stringify(project)} is missing ${
					configs.length === 1 ? "configuration" : "configurations"
				} ${stringifyArray(configs)}`;
			});

			if (errors.length === 1) {
				throw new BuildFailureError(
					tags.stripIndent`
						${errors[0]!} for target ${JSON.stringify(target)}
						Set the "unknownConfiguration" option to "skip" or "run" to either skip this project or run the target in this project without the missing configurations.
					`,
				);
			} else {
				throw new BuildFailureError(
					tags.stripIndents`
						The following projects are missing configurations for target ${JSON.stringify(
							target,
						)}:
						- ${errors.join("\n- ")}
						Set the "unknownConfiguration" option to "skip" or "run" to either skip these projects or run the target in these projects without the missing configurations.
					`,
				);
			}
		}
	}

	return await executeCombine(
		{
			targets: targetOptions != null ? {...targetOptions, targets} : targets,
			options,
			scheduler,
			...otherOptions,
		},
		context,
	);
}

function isEmptyObject(object?: object): boolean {
	return object == null || Object.keys(object).length === 0;
}
