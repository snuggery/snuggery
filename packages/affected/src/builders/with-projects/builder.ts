import type {BuilderContext} from '@angular-devkit/architect';
import {scheduleTarget} from '@snuggery/architect';
import {filterByPatterns} from '@snuggery/core';
import {defer, of} from 'rxjs';
import {switchMap} from 'rxjs/operators';

import {findAffectedProjects} from '../../changes';

import type {Schema} from './schema';

function hasTarget(value: unknown): value is {target: string} {
	return typeof (value as {target: string}).target === 'string';
}

export function execute(
	{
		include = '**',
		exclude,
		printOnly,
		fromRevision,
		toRevision,
		affectedFiles,
		optionName,
		...targetSpec
	}: Schema,
	context: BuilderContext,
) {
	return defer(async () => {
		const affectedProjects = Array.from(
			await findAffectedProjects(context, {
				from: fromRevision,
				to: toRevision,
				files: affectedFiles,
			}),
		);

		return filterByPatterns(affectedProjects, {include, exclude});
	}).pipe(
		switchMap(affectedProjects => {
			if (printOnly) {
				context.logger.info(affectedProjects.join('\n'));
			}

			if (printOnly || !affectedProjects.length) {
				return of({success: true});
			}

			return scheduleTarget(
				hasTarget(targetSpec) ? targetSpec.target : targetSpec,
				{[optionName]: affectedProjects},
				context,
			);
		}),
	);
}
