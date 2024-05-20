import type {StrictValidator} from "typanion";

import type {
	UpstreamProjectDefinition,
	UpstreamTargetDefinition,
	UpstreamWorkspaceDefinition,
} from "./types";
import type {
	JsonValue,
	ProjectDefinition,
	TargetDefinition,
	WorkspaceDefinition,
} from "./workspace";

export interface ExtraConfigurationDefinition {
	/**
	 * The name of the configuration
	 *
	 * You are strongly advised to use the package name as key to prevent
	 * naming clashes with other packages.
	 */
	readonly key: string;
}

export interface ExtraConfigurationDefinitionWithType<T extends JsonValue>
	extends ExtraConfigurationDefinition {
	/**
	 * Typanion validator function for the configuration value
	 */
	readonly test: StrictValidator<JsonValue, T>;
}

/**
 * Extract non-standard configuration from the workspace definition
 *
 * Configuration can be validated by passing in a `test` function in the
 * definition.
 *
 * This functionality allows creating leveled configuration in your workspace
 * configuration file. This allows users to define configuration on workspace
 * level, instead of being forced to configure every project separately.
 *
 * @param definition Definition for the configuration value
 * @param workspace The workspace from which to extract the configuration
 * @param projectName Name of the project in which to look for configuration
 * @param targetName Name of the target in which to look for configuration
 */
export function extractExtraConfiguration<
	T extends ExtraConfigurationDefinition &
		Partial<ExtraConfigurationDefinitionWithType<JsonValue>>,
>(
	definition: T,
	workspace: WorkspaceDefinition | UpstreamWorkspaceDefinition,
	projectName?: string,
	targetName?: string,
): T extends ExtraConfigurationDefinitionWithType<infer U> ? U[] : JsonValue[];
export function extractExtraConfiguration(
	{
		key,
		test,
	}: ExtraConfigurationDefinition &
		Partial<ExtraConfigurationDefinitionWithType<JsonValue>>,
	workspace: WorkspaceDefinition | UpstreamWorkspaceDefinition,
	projectName?: string,
	targetName?: string,
): JsonValue[] {
	const configurations: [Record<string, JsonValue | undefined>, string][] = [
		[workspace.extensions, "Workspace"],
	];

	if (projectName != null) {
		const project = workspace.projects.get(projectName) as
			| ProjectDefinition
			| UpstreamProjectDefinition
			| undefined;
		if (project == null) {
			throw new Error(
				`Project ${JSON.stringify(projectName)} doesn't exist in workspace`,
			);
		}

		configurations.push([
			project.extensions,
			`Project ${JSON.stringify(projectName)}`,
		]);

		if (targetName != null) {
			const target = project.targets.get(targetName) as
				| TargetDefinition
				| UpstreamTargetDefinition
				| undefined;
			if (target == null) {
				throw new Error(
					`Target ${JSON.stringify(
						targetName,
					)} doesn't exist in project ${JSON.stringify(projectName)}`,
				);
			}

			if ("extensions" in target) {
				configurations.push([
					target.extensions,
					`Project ${JSON.stringify(projectName)} target ${JSON.stringify(
						targetName,
					)}`,
				]);
			}
		}
	}

	const values = configurations
		.filter(([configuration]) => configuration[key] !== undefined)
		.map(([configuration, location]): [JsonValue, string] => [
			configuration[key]!,
			location,
		]);

	if (test == null) {
		return values;
	}

	return values.map(([value, location]) => {
		const errors: string[] = [];

		if (!test(value, {errors})) {
			if (errors.length === 1) {
				throw new Error(
					`${location} configuration ${JSON.stringify(key)} is invalid: ${
						errors[0]
					}`,
				);
			} else {
				throw new Error(
					`${location} configuration ${JSON.stringify(
						key,
					)} is invalid:\n- ${errors.join("\n- ")}`,
				);
			}
		}

		return value;
	});
}
