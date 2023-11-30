import type {Target as ArchitectTarget} from '@angular-devkit/architect';
import type {JsonObject} from '@snuggery/core';
import {Observable, defer, of, from} from 'rxjs';
import {switchMap} from 'rxjs/operators';

import type {BuilderContext, BuilderOutput} from './create-builder';
import {resolveTargetString, targetFromTargetString} from './target';

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
					success: false,
					error: String((err as Error)?.message || err),
				});
			}

			return (
				require('@angular-devkit/architect') as typeof import('@angular-devkit/architect')
			).scheduleTargetAndForget(context, target, options, {target});
		} else {
			const currentTarget = context.target;

			let newTarget: ArchitectTarget;

			// https://github.com/angular/angular-cli/issues/19905
			if (currentTarget?.target) {
				newTarget = {...currentTarget};

				if (targetSpec.project) {
					newTarget.project = targetSpec.project;
				}
			} else if (targetSpec.project) {
				newTarget = {
					project: targetSpec.project,
					target: '$generated',
				};
			} else {
				return of({
					success: false,
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
						...options,
					},
					{
						target: newTarget,
					},
				),
			).pipe(
				switchMap(
					(run) =>
						new Observable<BuilderOutput>((observer) => {
							let resolve: () => void | undefined;
							const promise = new Promise<void>((r) => (resolve = r));
							context.addTeardown(() => promise);

							observer.add(run.output.subscribe(observer));

							return () => {
								run.stop().then(resolve);
							};
						}),
				),
			);
		}
	});
}
