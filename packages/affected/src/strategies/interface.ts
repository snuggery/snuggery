import type {BuilderContext} from '@angular-devkit/architect';
import type {JsonObject, WorkspaceDefinition} from '@snuggery/core';

export interface ChangeLocatorContext {
	/**
	 * Context the builder is running in
	 */
	readonly context: BuilderContext;

	/**
	 * The configuration of the workspace (angular.json, workspace.json, etc)
	 */
	readonly workspaceConfiguration: WorkspaceDefinition;

	/**
	 * Configurations for this strategy
	 *
	 * This can be an array of configuration objects, e.g. if the strategy is
	 * configured on workspace, project, and target level there will be three
	 * values.
	 *
	 * Latter configurations should override earlier configurations. If the
	 * strategy is configured in the workspace, project, and target, it will
	 * be passed the configurations in that exact order.
	 */
	readonly locatorConfigurations: readonly JsonObject[];
}

export interface ChangeLocatorStrategy {
	/**
	 * Find (extra) affected projects
	 *
	 * The passed in set `affectedProjects` contains all projects that have previously been
	 * found to have been affected.
	 *
	 * The set `affectedFiles` contains all files that are considered affected.
	 *
	 * @param context Context for this strategy
	 * @param affectedFiles The set of affected files, in paths relative to the workspace root
	 * @param affectedProjects The set of affected projects
	 */
	findAffectedProjects?(
		context: ChangeLocatorContext,
		affectedFiles: ReadonlySet<string>,
		affectedProjects: Set<string>,
	): void | Promise<void>;

	/**
	 * Find (extra) affected files
	 *
	 * The passed in set contains all files that have previously been found
	 * to have been affected.
	 *
	 * The strategy should modify this passed in set by adding or deleting
	 * files.
	 *
	 * @param context Context for this strategy
	 * @param affectedFiles The set of affected files, in paths relative to the workspace root
	 */
	findAffectedFiles?(
		context: ChangeLocatorContext,
		affectedFiles: Set<string>,
	): void | Promise<void>;
}
