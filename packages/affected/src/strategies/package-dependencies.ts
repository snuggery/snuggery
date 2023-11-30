import {resolveWorkspacePath} from "@snuggery/architect";

import {MapOfSets} from "../utils/map-of-sets";
import {getPackageInformation} from "../utils/package-info";

import type {ChangeLocatorStrategy} from "./interface";

/**
 * Strategy that uses the dependencies between packages in the workspace
 * to extend the set of affected projects.
 */
export const packageDependenciesStrategy: ChangeLocatorStrategy = {
	async findAffectedProjects(
		{context, workspaceConfiguration, locatorConfigurations},
		_,
		affectedProjects,
	) {
		let includeDependencies = false;
		let includeDependents = true;

		const packageRelationShips = new MapOfSets<string, string>();

		for (const config of locatorConfigurations) {
			if (typeof config.includeDependencies === "boolean") {
				includeDependencies = config.includeDependencies;
			}
			if (typeof config.includeDependents === "boolean") {
				includeDependents = config.includeDependents;
			}
		}

		if (!includeDependencies && !includeDependents) {
			return;
		}

		const projectToLocationMap = new Map<string, string>();
		const locationToProjectMap = new MapOfSets<string, string>();

		for (const [name, {root}] of workspaceConfiguration.projects) {
			const resolvedRoot = resolveWorkspacePath(context, root);

			projectToLocationMap.set(name, resolvedRoot);
			locationToProjectMap.get(resolvedRoot).add(name);
		}

		const packageInformation = await getPackageInformation(
			context.workspaceRoot,
		);

		const packageToLocationMap = new Map<string, string>();
		const locationToPackageMap = new Map<string, string>();

		for (const [name, {location}] of Object.entries(packageInformation)) {
			packageToLocationMap.set(name, location);
			locationToPackageMap.set(location, name);
		}

		if (includeDependencies) {
			for (const [dependent, {workspaceDependencies}] of Object.entries(
				packageInformation,
			)) {
				const dependencies = packageRelationShips.get(dependent);

				for (const dependency of workspaceDependencies) {
					dependencies.add(dependency);
				}
			}
		}

		if (includeDependents) {
			for (const [dependent, {workspaceDependencies}] of Object.entries(
				packageInformation,
			)) {
				for (const dependency of workspaceDependencies) {
					packageRelationShips.get(dependency).add(dependent);
				}
			}
		}

		const changedPackages = new Set(
			Array.from(
				affectedProjects,
				(project) =>
					locationToPackageMap.get(projectToLocationMap.get(project)!)!,
			).filter((v) => v != null),
		);

		const addedPackages = new Set<string>(changedPackages);
		do {
			const previousAddedPackages = Array.from(addedPackages);
			addedPackages.clear();

			for (const project of previousAddedPackages) {
				const extraForProject = packageRelationShips.get(project);
				if (extraForProject == null) {
					continue;
				}

				for (const extraProject of extraForProject) {
					if (!changedPackages.has(extraProject)) {
						changedPackages.add(extraProject);
						addedPackages.add(extraProject);
					}
				}
			}
		} while (addedPackages.size > 0);

		for (const pkg of changedPackages) {
			for (const project of locationToProjectMap.get(
				packageToLocationMap.get(pkg)!,
			) ?? []) {
				affectedProjects.add(project);
			}
		}
	},
};
