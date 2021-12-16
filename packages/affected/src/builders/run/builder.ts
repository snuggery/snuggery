import type {BuilderContext} from '@angular-devkit/architect';
import {filterByPatterns} from '@snuggery/core';
import {glob} from '@snuggery/snuggery/builders';
import {defer, of} from 'rxjs';
import {switchMap} from 'rxjs/operators';

import {findAffectedProjects} from '../../changes';

import type {Schema} from './schema';

export function execute(
	{
		include = '**',
		exclude,
		printOnly,
		fromRevision,
		toRevision,
		affectedFiles,
		...opts
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

			return glob(
				{
					...opts,
					include: affectedProjects,
				},
				context,
			);
		}),
	);
}
