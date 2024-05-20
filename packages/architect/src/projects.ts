import {
	filterByPatterns,
	readWorkspace,
	type WorkspaceDefinition,
	type UpstreamWorkspaceDefinition,
} from "@snuggery/core";

import type {BuilderContext} from "./create-builder";

export async function findProjects(
	context: BuilderContext,
	{
		workspace,
		include,
		exclude,
	}: {
		workspace?: WorkspaceDefinition | UpstreamWorkspaceDefinition | null;
		include: string | string[];
		exclude?: string | string[];
	},
): Promise<string[]> {
	return filterByPatterns(
		Array.from(
			(
				workspace ?? (await readWorkspace(context.workspaceRoot))
			).projects.keys(),
		),
		{
			include,
			exclude,
		},
	);
}
