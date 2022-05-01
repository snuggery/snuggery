import type {BuilderContext, BuilderOutput} from '@angular-devkit/architect';
import {normalize} from '@angular-devkit/core';
import {
	findProjects,
	findWorkspace,
	resolveWorkspacePath,
	scheduleTarget,
} from '@snuggery/architect';
import {switchMapSuccessfulResult} from '@snuggery/architect/operators';
import {concat, Observable, of, identity, forkJoin} from 'rxjs';
import {
	catchError,
	endWith,
	first,
	ignoreElements,
	mapTo,
	switchMap,
} from 'rxjs/operators';

import {executeVersion} from '../version';

import type {Schema} from './schema';

const snuggeryPluginName = '@yarnpkg/plugin-snuggery';

export function executeDeploy(
	{buildTarget, distTag, useWorkspacePlugin, include = '**', exclude}: Schema,
	context: BuilderContext,
): Observable<BuilderOutput> {
	return executeVersion({}, context).pipe(
		buildTarget
			? switchMapSuccessfulResult(result =>
					scheduleTarget(buildTarget, {}, context).pipe(first(), mapTo(result)),
			  )
			: identity,

		switchMapSuccessfulResult(({appliedVersions, yarn}) => {
			return forkJoin([
				yarn.listPlugins(),
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
			]).pipe(
				switchMap(([plugins, includedWorkingDirectories]) => {
					const hasPlugin = plugins.some(
						plugin => plugin.name === snuggeryPluginName,
					);

					if (useWorkspacePlugin && !hasPlugin) {
						return of({
							success: false,
							error: `Couldn't find ${snuggeryPluginName}`,
						});
					}

					const workingDirectoriesToRelease = appliedVersions
						.map(({cwd}) => cwd)
						.filter(cwd => includedWorkingDirectories.has(normalize(cwd)));

					return concat(
						...workingDirectoriesToRelease.map(cwd => {
							if (useWorkspacePlugin !== false && hasPlugin) {
								return yarn.snuggeryWorkspacePublish({tag: distTag, cwd});
							} else {
								return yarn.npmPublish({tag: distTag, cwd});
							}
						}),
					).pipe(
						ignoreElements(),
						endWith({success: true}),
						catchError(e =>
							of({
								success: false,
								error: e.message,
							}),
						),
					);
				}),
			);
		}),
	);
}
