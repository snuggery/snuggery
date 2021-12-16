import type {ChangeLocatorStrategy} from './interface';

/**
 * Strategy that maps affected files onto affected projects
 *
 * This strategy should come before any other strategy that
 * implements `findAffectedProjects`.
 */
export const projectsOfFilesStrategy: ChangeLocatorStrategy = {
	findAffectedProjects(
		{workspaceConfiguration},
		affectedFiles,
		affectedProjects,
	) {
		const rootToProjectNamesMap = new Map<string, string[]>();

		for (const [name, project] of workspaceConfiguration.projects) {
			let registeredProjects = rootToProjectNamesMap.get(project.root);

			if (registeredProjects == null) {
				registeredProjects = [];
				rootToProjectNamesMap.set(project.root, registeredProjects);
			}

			registeredProjects.push(name);
		}

		for (const file of affectedFiles) {
			for (const [root, projects] of rootToProjectNamesMap) {
				if (
					file === root ||
					file.startsWith(`${root}/`) ||
					file.startsWith(`${root}\\`)
				) {
					for (const project of projects) {
						affectedProjects.add(project);
					}
				}
			}
		}
	},
};
