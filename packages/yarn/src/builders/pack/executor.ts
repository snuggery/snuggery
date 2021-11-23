import type {BuilderContext, BuilderOutput} from '@angular-devkit/architect';
import {getProjectPath, resolveWorkspacePath} from '@snuggery/architect';
import {defer, from, Observable, of} from 'rxjs';
import {catchError, mapTo, switchMap} from 'rxjs/operators';

import {loadYarn} from '../../utils/yarn';

import type {Schema} from './schema';

const snuggeryWorkspacePlugin = '@yarnpkg/plugin-snuggery-workspace';

export function executePack(
	{directory, useWorkspacePlugin}: Schema,
	context: BuilderContext,
): Observable<BuilderOutput> {
	return defer(() => loadYarn(context)).pipe(
		switchMap(yarn => {
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

					return from(getProjectPath(context)).pipe(
						switchMap(cwd => {
							const directoryToPack = directory
								? resolveWorkspacePath(context, directory)
								: cwd;

							if (
								useWorkspacePlugin === true ||
								(useWorkspacePlugin !== false &&
									hasPlugin &&
									directoryToPack !== cwd)
							) {
								return yarn.snuggeryWorkspacePack({
									cwd,
									directoryToPack,
								});
							} else {
								if (directoryToPack !== cwd) {
									throw new Error(
										`Packing a folder other than the workspace requires the ${snuggeryWorkspacePlugin} yarn plugin to be installed`,
									);
								}

								return yarn.npmPack({cwd});
							}
						}),
						mapTo<void, BuilderOutput>({success: true}),
						catchError(e =>
							of<BuilderOutput>({
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
