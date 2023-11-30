import type {Target} from "@angular-devkit/architect";

import type {BuilderContext} from "./create-builder";

export function targetStringFromTarget(target: Target): string {
	if (target.configuration) {
		return `${target.project}:${target.target}:${target.configuration}`;
	} else {
		return `${target.project}:${target.target}`;
	}
}

export function targetFromTargetString(targetString: string): Target {
	const parts = targetString.split(":", 3);

	if (parts.length < 2) {
		throw new Error(`Invalid target: ${JSON.stringify(targetString)}`);
	}

	const [project, target, configuration] = parts as
		| [string, string]
		| [string, string, string];

	return configuration ? {project, target, configuration} : {project, target};
}

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

	if (targetString.includes(":")) {
		target = targetFromTargetString(targetString);
	} else {
		target = {project: "", target: targetString};
	}

	if (!target.project) {
		if (context.target?.project == null) {
			throw new Error(`Target is required to resolve spec "${targetString}"`);
		}

		target.project = context.target.project;
	}

	return targetStringFromTarget(target);
}
