import {
  BuilderContext,
  BuilderOutput,
  Target as ArchitectTarget,
  targetStringFromTarget,
} from '@angular-devkit/architect';
import type {TargetSpecifier} from '@snuggery/architect';
import {findWorkspace} from '@snuggery/snuggery/cli';
import {filterByPatterns} from '@snuggery/snuggery/utils';
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
    unknownConfiguration,
    unknownTarget,
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
      }).flatMap(project => {
        if (builder != null) {
          return {
            builder,
            project,
          };
        } else {
          if (unknownTarget === 'skip') {
            const projectDefinition = workspace!.projects.get(project)!;

            if (!projectDefinition.targets.has(target!)) {
              return [];
            }
          }

          if (
            unknownConfiguration != null &&
            unknownConfiguration !== 'error'
          ) {
            const targetDefinition = workspace!.projects
              .get(project)!
              .targets.get(target!);
            if (targetDefinition != null) {
              const requestedConfigurations = configuration?.split(',') ?? [];
              let modified = false;

              for (const [i, config] of requestedConfigurations.entries()) {
                if (
                  targetDefinition.configurations == null ||
                  !Reflect.has(targetDefinition.configurations, config)
                ) {
                  switch (unknownConfiguration) {
                    case 'skip':
                      return [];
                    case 'run':
                      requestedConfigurations.splice(i);
                      modified = true;
                  }
                }
              }

              if (modified) {
                configuration = requestedConfigurations.join(',');
              }
            }
          }

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
