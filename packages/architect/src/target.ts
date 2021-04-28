import {
  BuilderContext,
  Target,
  targetFromTargetString,
  targetStringFromTarget,
} from '@angular-devkit/architect';

/**
 * Resolve the given target string into a fully qualified target string
 *
 * If the given `targetString` doesn't contain any `:`, it is used as target name on the current
 * project.
 *
 * @param context The builder context
 * @param targetString The unresolved target
 */
export function resolveTargetString(
  context: BuilderContext,
  targetString: string,
): string {
  let target: Target;

  if (targetString.includes(':')) {
    target = targetFromTargetString(targetString);
  } else {
    target = {project: '', target: targetString};
  }

  if (!target.project) {
    if (context.target?.project == null) {
      throw new Error(`Target is required to resolve spec "${targetString}"`);
    }

    target.project = context.target.project;
  }

  return targetStringFromTarget(target);
}
