import {
  BuilderContext,
  targetStringFromTarget,
} from '@angular-devkit/architect';

/**
 * Resolve the given target string into a fully qualified target string
 *
 * If the given `targetString` doens't contain any `:`, it is used as target name on the current
 * project.
 *
 * @param context The builder context
 * @param targetSpring The unresolved target
 */
export function resolveTargetString(
  context: BuilderContext,
  targetSpring: string,
): string {
  if (targetSpring.includes(':')) {
    return targetSpring;
  }

  if (context.target == null) {
    throw new Error(`Target is required to resolve spec "${targetSpring}"`);
  }

  return targetStringFromTarget({
    project: context.target.project,
    target: targetSpring,
  });
}
