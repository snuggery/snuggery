import {
  BuilderContext,
  BuilderOutput,
  scheduleTargetAndForget,
  Target as ArchitectTarget,
  targetFromTargetString,
} from '@angular-devkit/architect';
import type {JsonObject} from '@angular-devkit/core';
import {Observable, defer, of, from} from 'rxjs';
import {switchMap, finalize} from 'rxjs/operators';

import {resolveTargetString} from './target';

/**
 * A specifier for a transient target, i.e. a combination of builder and configuration that together
 * make up a target
 *
 * It's called "transient" because the target is not an actual target in the workspace
 * configuration.
 */
export interface TransientTarget {
  /**
   * The builder to run, e.g. `@angular-devkit/build-angular:browser`
   */
  builder: string;

  /**
   * The project to run the target in.
   *
   * By default this is the project of the currently running builder
   */
  project?: string;

  /**
   * Options to pass into the builder, if any
   */
  options?: JsonObject;
}

/**
 * Specifier for a target to run
 *
 * If this value is a `TransientTarget`, the builder is scheduled.
 *
 * If the value is a `string`, the actual target gets resolved. If the value contains a `:`, it is
 * considered to be a complete target specifier (i.e. `project:target` or `project:target:configuration`).
 * If the value doesn't contain a `:`, it is considered the name of the target to run in the
 * currently active project.
 */
export type TargetSpecifier = string | TransientTarget;

/**
 * Schedule and run the given builder target
 *
 * @param targetSpec The builder target to schedule
 * @param options Options to pass into the target
 * @param context The context of the builder scheduling the target
 */
export function scheduleTarget(
  targetSpec: TargetSpecifier,
  options: JsonObject,
  context: BuilderContext,
): Observable<BuilderOutput> {
  return defer(() => {
    if (typeof targetSpec === 'string') {
      let target: ArchitectTarget;

      try {
        target = targetFromTargetString(
          resolveTargetString(context, targetSpec),
        );
      } catch (err) {
        return of({
          success: false as const,
          error: String((err as Error)?.message || err),
        });
      }

      return scheduleTargetAndForget(context, target, options, {target});
    } else {
      const currentTarget = context.target;

      if (currentTarget == null) {
        return of({
          success: false as const,
          error: `Cannot run target without project ${JSON.stringify(
            targetSpec,
          )} in a context without project`,
        });
      }

      return from(
        context.scheduleBuilder(
          targetSpec.builder,
          {
            ...(targetSpec.options || {}),
            options,
          },
          {
            target: {
              ...currentTarget,
              project: targetSpec.project || currentTarget.project,
            } as ArchitectTarget,
          },
        ),
      ).pipe(
        switchMap(run => {
          let resolve: () => void | undefined;
          const promise = new Promise<void>(r => (resolve = r));
          context.addTeardown(() => promise);

          return run.output.pipe(
            finalize(() => {
              run.stop().then(resolve);
            }),
          );
        }),
      );
    }
  });
}
