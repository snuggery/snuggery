import type {BuilderContext, BuilderOutput} from '@angular-devkit/architect';
import type {JsonObject} from '@angular-devkit/core';
import type {TargetSpecifier} from '@snuggery/architect';
import {
  EMPTY,
  MonoTypeOperatorFunction,
  Observable,
  of,
  pipe,
  range,
  throwError,
  zip,
} from 'rxjs';
import {catchError, endWith, mergeMap, mergeMapTo, tap} from 'rxjs/operators';

import {createScheduler} from './schedulers';
import type {ParallelTarget, Schema, SerialTarget, Target} from './schema';
import {Type} from './types';

class BuildFailedError extends Error {
  public constructor(public readonly output: BuilderOutput) {
    super();
  }
}

function throwIfFailed(): MonoTypeOperatorFunction<BuilderOutput> {
  return pipe(
    mergeMap(result =>
      result.success ? of(result) : throwError(new BuildFailedError(result)),
    ),
  );
}

/**
 * Combine multiple builders into a single builder
 */
export function execute(
  {targets, scheduler: schedulerType, options, ...otherOptions}: Schema,
  context: BuilderContext,
): Observable<BuilderOutput> {
  if (Array.isArray(targets)) {
    targets = {
      type: Type.Serial,
      targets,
    };
  }

  const targetCount = countTargets(targets);
  context.reportProgress(0, targetCount);

  const scheduler = createScheduler(schedulerType, context);

  if (Object.keys(otherOptions).length > 0) {
    const extraOptions = Object.fromEntries(
      Array.from(Object.entries(otherOptions))
        .filter(([key]) => key.startsWith('options.'))
        .map(([key, value]) => [key.slice('options.'.length), value]),
    ) as JsonObject;

    options = {
      ...options,
      ...extraOptions,
    };
  }

  return zip(
    scheduler.run(targets, options).pipe(throwIfFailed()),
    range(1, targetCount),
  ).pipe(
    tap(([, numberDone]) => context.reportProgress(numberDone)),
    mergeMapTo(EMPTY),

    endWith({success: true}),
    catchError(err =>
      err instanceof BuildFailedError ? of(err.output) : throwError(err),
    ),
  );

  function isSingleTarget(target: Target): target is TargetSpecifier {
    return typeof target === 'string' || 'builder' in target;
  }

  function countTargets({targets}: SerialTarget | ParallelTarget): number {
    return targets.reduce((count, target) => {
      if (isSingleTarget(target)) {
        return count + 1;
      } else {
        return count + countTargets(target);
      }
    }, 0);
  }
}
