import type {BuilderContext, BuilderOutput} from '@angular-devkit/architect';
import {switchMapSuccessfulResult} from '@snuggery/architect/operators';
import {defer, of, Observable} from 'rxjs';
import {catchError, map, switchMap, tap} from 'rxjs/operators';

import {AppliedVersion, loadYarn, Yarn} from '../../utils/yarn';

export interface VersionBuilderOutput {
  success: true;
  appliedVersions: AppliedVersion[];
  yarn: Yarn;
}

const versionPluginName = '@yarnpkg/plugin-version';

export function applyVersion(
  context: BuilderContext,
): Observable<VersionBuilderOutput | (BuilderOutput & {success: false})> {
  return defer(async () => {
    try {
      return {
        success: true as const,
        yarn: await loadYarn(context),
      };
    } catch (e) {
      return {
        success: false as const,
        error: e instanceof Error ? e.message : `${e}`,
        yarn: null,
      };
    }
  }).pipe(
    switchMapSuccessfulResult(({yarn}) => {
      return yarn.listPlugins().pipe(
        switchMap(plugins => {
          if (!plugins.find(plugin => plugin.name === versionPluginName)) {
            return of({
              success: false as const,
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
              (appliedVersions): VersionBuilderOutput => ({
                success: true,
                appliedVersions,
                yarn,
              }),
            ),
            catchError(e => of({success: false as const, error: e.message})),
          );
        }),
      );
    }),
  );
}
