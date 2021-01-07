import {
  BuilderContext,
  BuilderOutput,
  Target as ArchitectTarget,
  targetStringFromTarget,
} from '@angular-devkit/architect';
import type {TargetSpecifier} from '@bgotink/atelier/builder-utils';
import {findWorkspace} from '@bgotink/atelier/cli';
import {filterByPatterns} from '@bgotink/atelier/utils';
import {defer, Observable} from 'rxjs';
import {switchMap, map} from 'rxjs/operators';

import {execute as executeCombine, Schema as CombineSchema} from '../combine';

import type {Schema} from './schema';

/**
 * Execute a target in multiple projects, defined using glob patterns
 */
export function execute(
  {
    builder,
    include,
    configuration,
    exclude,
    options,
    scheduler,
    target,
    targetOptions,
    ...otherOptions
  }: Schema,
  context: BuilderContext,
): Observable<BuilderOutput> {
  if (builder == null && target == null) {
    if (context.target == null) {
      throw new Error(
        `Input "target" is required when executing builder via API`,
      );
    }

    target = context.target.target;
  }

  exclude = [exclude || []].flat();
  include = [include].flat();

  if (
    context.target != null &&
    (builder != null || context.target.target === target)
  ) {
    exclude.push(context.target.project);
  }

  if (isEmptyObject(options)) {
    options = undefined;
  }
  if (isEmptyObject(targetOptions)) {
    targetOptions = undefined;
  }

  return defer(() => findWorkspace(context.workspaceRoot)).pipe(
    map(workspace =>
      filterByPatterns(Array.from(workspace?.projects.keys() ?? []), {
        include,
        exclude,
      }).map(project => {
        if (builder != null) {
          return {
            builder,
            project,
          };
        } else {
          return targetStringFromTarget({
            project,
            target,
            configuration,
          } as ArchitectTarget);
        }
      }),
    ),
    map<TargetSpecifier[], CombineSchema>(targets => {
      if (targetOptions != null) {
        return {
          targets: {
            ...targetOptions,
            targets,
          },
          options,
          scheduler,
          ...otherOptions,
        };
      } else {
        return {targets, options, scheduler, ...otherOptions};
      }
    }),
    switchMap(combineConfig => executeCombine(combineConfig, context)),
  );
}

function isEmptyObject(object?: object): boolean {
  return object == null || Object.keys(object).length === 0;
}
