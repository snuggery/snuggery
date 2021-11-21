import type {BuilderContext} from '@angular-devkit/architect';
import {
	switchMapSuccessfulResult,
	ValuedBuilderOutput,
} from '@snuggery/architect/operators';
import {defer, of, Observable} from 'rxjs';
import {catchError, map, switchMap, tap} from 'rxjs/operators';

import {AppliedVersion, loadYarn, Yarn} from '../../utils/yarn';

export interface VersionBuilderOutput {
	appliedVersions: AppliedVersion[];
	yarn: Yarn;
}

const versionPluginName = '@yarnpkg/plugin-version';

export function applyVersion(
	context: BuilderContext,
): Observable<ValuedBuilderOutput<VersionBuilderOutput>> {
	return defer(async (): Promise<ValuedBuilderOutput<{yarn: Yarn}>> => {
		try {
			return {
				success: true,
				yarn: await loadYarn(context),
			};
		} catch (e) {
			return {
				success: false,
				error: e instanceof Error ? e.message : `${e}`,
			};
		}
	}).pipe(
		switchMapSuccessfulResult(({yarn}) => {
			return yarn.listPlugins().pipe(
				switchMap(
					(plugins): Observable<ValuedBuilderOutput<VersionBuilderOutput>> => {
						if (!plugins.find(plugin => plugin.name === versionPluginName)) {
							return of({
								success: false,
								error: `Yarn plugin ${versionPluginName} is required for the @snuggery/yarn:version command but it wasn't found`,
							});
						}

						return yarn.applyVersion().pipe(
							tap(appliedVersions => {
								context.logger.info('Version updates:');
								for (const {
									cwd,
									ident,
									oldVersion,
									newVersion,
								} of appliedVersions) {
									if (cwd && newVersion && ident) {
										context.logger.info(
											`${ident.padEnd(20, ' ')} ${oldVersion.padEnd(
												10,
												' ',
											)} -> ${newVersion}`,
										);
									}
								}
							}),
							map(
								(
									appliedVersions,
								): ValuedBuilderOutput<VersionBuilderOutput> => ({
									success: true,
									appliedVersions,
									yarn,
								}),
							),
							catchError(e =>
								of<ValuedBuilderOutput<never>>({
									success: false,
									error: e.message,
								}),
							),
						);
					},
				),
			);
		}),
	);
}
