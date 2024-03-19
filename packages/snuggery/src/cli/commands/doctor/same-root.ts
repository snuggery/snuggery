import {posix} from "path";

import {SetMap} from "../../utils/collections.js";

import type {DoctorContext} from "./context.js";

export function checkProjectsWithSameRoot({workspace, report}: DoctorContext) {
	const projectPathToName = new SetMap<string, string>();

	for (const [name, project] of workspace.projects) {
		projectPathToName.get(posix.normalize(project.root)).add(name);
	}

	for (const [path, names] of projectPathToName) {
		if (names.size !== 1) {
			report.reportError(
				`Projects ${Array.from(names, (name) => JSON.stringify(name)).join(
					", ",
				)} have the same root: ${JSON.stringify(path)}`,
			);
		}
	}
}
