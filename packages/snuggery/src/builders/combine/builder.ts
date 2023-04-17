import {
	type BuilderContext,
	type BuilderOutput,
	BuildFailureError,
	lastValueFrom,
	TargetSpecifier,
} from '@snuggery/architect';
import type {JsonObject} from '@snuggery/core';
import {type MonoTypeOperatorFunction, pipe, range, zip} from 'rxjs';
import {map, tap} from 'rxjs/operators';

import {createScheduler} from './schedulers';
import type {ParallelTarget, Schema, SerialTarget, Target} from './schema';
import {Type} from './types';

function throwIfFailed(): MonoTypeOperatorFunction<BuilderOutput> {
	return pipe(
		map(result => {
			if (result.success) {
				return result;
			} else {
				throw new BuildFailureError(result.error);
			}
		}),
	);
}

/**
 * Combine multiple builders into a single builder
 */
export async function execute(
	{targets, scheduler: schedulerType, options, ...otherOptions}: Schema,
	context: BuilderContext,
): Promise<void> {
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

	await lastValueFrom(
		context,
		zip(
			scheduler.run(targets, options).pipe(throwIfFailed()),
			range(1, targetCount),
		).pipe(tap(([, numberDone]) => context.reportProgress(numberDone))),
	);
}

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
