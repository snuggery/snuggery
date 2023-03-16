import {normalize} from '@angular-devkit/core';
import {
	findProjects,
	findWorkspace,
	firstValueFrom,
	resolveWorkspacePath,
	scheduleTarget,
} from '@snuggery/architect';
import {
	type BuilderContext,
	BuildFailureError,
} from '@snuggery/architect/create-builder';

import {executeVersion} from '../version';

import type {Schema} from './schema';

const snuggeryPluginName = '@yarnpkg/plugin-snuggery';

export async function executeDeploy(
	{buildTarget, distTag, useWorkspacePlugin, include = '**', exclude}: Schema,
	context: BuilderContext,
): Promise<void> {
	const {appliedVersions, yarn} = await executeVersion({}, context);

	if (buildTarget) {
		const buildResult = await firstValueFrom(
			context,
			scheduleTarget(buildTarget, {}, context),
		);
		if (!buildResult.success) {
			throw new BuildFailureError(buildResult.error);
		}
	}

	const [hasPlugin, includedWorkingDirectories] = await Promise.all([
		yarn.hasPlugin(),
		findWorkspace(context).then(async workspace => {
			const projects = await findProjects(context, {
				workspace,
				include,
				exclude,
			});

			return new Set(
				projects.map(project =>
					normalize(
						resolveWorkspacePath(
							context,
							workspace.projects.get(project)!.root,
						),
					),
				),
			);
		}),
	]);

	if (useWorkspacePlugin && !hasPlugin) {
		throw new BuildFailureError(`Couldn't find ${snuggeryPluginName}`);
	}

	const workingDirectoriesToRelease = appliedVersions
		.map(({cwd}) => cwd)
		.filter(cwd => includedWorkingDirectories.has(normalize(cwd)));

	for (const cwd of workingDirectoriesToRelease) {
		if (useWorkspacePlugin !== false && hasPlugin) {
			await yarn.snuggeryWorkspacePublish({tag: distTag, cwd});
		} else {
			await yarn.npmPublish({tag: distTag, cwd});
		}
	}
}
