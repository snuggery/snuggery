import type {BuilderContext} from '@angular-devkit/architect';
import {scheduleTarget} from '@snuggery/architect';
import {filterByPatterns} from '@snuggery/core';
import {defer, of} from 'rxjs';
import {switchMap} from 'rxjs/operators';

import {findAffectedFiles} from '../../changes';

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
		optionName,
		...targetSpec
	}: Schema,
	context: BuilderContext,
) {
	return defer(async () => {
		const affectedFiles = Array.from(
			await findAffectedFiles(context, {
				from: fromRevision,
				to: toRevision,
			}),
		);

		return filterByPatterns(affectedFiles, {include, exclude});
	}).pipe(
		switchMap(affectedFiles => {
			if (printOnly) {
				context.logger.info(affectedFiles.join('\n'));
			}

			if (printOnly || !affectedFiles.length) {
				return of({success: true});
			}

			return scheduleTarget(
				hasTarget(targetSpec) ? targetSpec.target : targetSpec,
				{[optionName]: affectedFiles},
				context,
			);
		}),
	);
}
