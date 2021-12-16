import {filterByPatterns, isJsonArray} from '@snuggery/core';

import {MapOfSets} from '../utils/map-of-sets';

import type {ChangeLocatorStrategy} from './interface';

/**
 * Strategy that uses a map defining extra project dependencies to extend the affected projects
 */
export const extraProjectDependenciesStrategy: ChangeLocatorStrategy = {
	findAffectedProjects(
		{workspaceConfiguration, locatorConfigurations},
		_,
		affectedProjects,
	) {
		let projectRelationships = new MapOfSets<string, string>();

		for (const config of locatorConfigurations) {
			for (const [key, value] of Object.entries(config)) {
				const extras = projectRelationships.get(key);

				if (typeof value === 'string') {
					extras.add(value);
				} else if (isJsonArray(value)) {
					for (const v of value) {
						if (typeof v === 'string') {
							extras.add(v);
						}
					}
				}
			}
		}

		const allProjects = Array.from(workspaceConfiguration.projects.keys());

		projectRelationships = new MapOfSets(
			Array.from(projectRelationships, ([name, globs]) => [
				name,
				new Set(filterByPatterns(allProjects, {include: Array.from(globs)})),
			]),
		);

		const addedProjects = new Set<string>();
		do {
			const previousAddedProjects = Array.from(addedProjects);
			addedProjects.clear();

			for (const project of previousAddedProjects) {
				const extraForProject = projectRelationships.get(project);
				if (extraForProject == null) {
					continue;
				}

				for (const extraProject of extraForProject) {
					if (!affectedProjects.has(extraProject)) {
						affectedProjects.add(extraProject);
						addedProjects.add(extraProject);
					}
				}
			}
		} while (addedProjects.size > 0);
	},
};
