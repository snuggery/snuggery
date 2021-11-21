import type {BuilderContext, BuilderOutput} from '@angular-devkit/architect';
import {scheduleTarget} from '@snuggery/architect';
import {switchMapSuccessfulResult} from '@snuggery/architect/operators';
import {concat, Observable, of} from 'rxjs';
import {
	catchError,
	endWith,
	first,
	ignoreElements,
	mapTo,
	switchMap,
	tap,
} from 'rxjs/operators';

import {executeVersion} from '../version';

import type {Schema} from './schema';

const snuggeryWorkspacePlugin = '@yarnpkg/plugin-snuggery-workspace';

export function executeDeploy(
	{buildTarget, distTag, useWorkspacePlugin}: Schema,
	context: BuilderContext,
): Observable<BuilderOutput> {
	return executeVersion({}, context).pipe(
		buildTarget
			? switchMapSuccessfulResult(result => {
					return scheduleTarget(buildTarget, {}, context).pipe(
						first(),
						mapTo(result),
					);
			  })
			: tap(),

		switchMapSuccessfulResult(({appliedVersions, yarn}) => {
			return yarn.listPlugins().pipe(
				switchMap(plugins => {
					const hasPlugin = plugins.some(
						plugin => plugin.name === snuggeryWorkspacePlugin,
					);

					if (useWorkspacePlugin && !hasPlugin) {
						return of({
							success: false,
							error: `Couldn't find ${snuggeryWorkspacePlugin}`,
						});
					}

					return concat(
						...appliedVersions.map(({cwd}) => {
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
