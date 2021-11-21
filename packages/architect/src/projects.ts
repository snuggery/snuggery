import type {BuilderContext} from '@angular-devkit/architect';
import type {workspaces} from '@angular-devkit/core';
import {
	filterByPatterns,
	readWorkspace,
	WorkspaceDefinition,
} from '@snuggery/core';

export async function findProjects(
	context: BuilderContext,
	{
		workspace,
		include,
		exclude,
	}: {
		workspace?: WorkspaceDefinition | workspaces.WorkspaceDefinition | null;
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
