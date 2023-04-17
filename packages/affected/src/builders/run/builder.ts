import type {BuilderContext} from '@snuggery/architect';
import {filterByPatterns} from '@snuggery/core';
import {glob} from '@snuggery/snuggery/builders';

import {findAffectedProjects} from '../../changes';

import type {Schema} from './schema';

export async function execute(
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
	const affectedProjects = filterByPatterns(
		Array.from(
			await findAffectedProjects(context, {
				from: fromRevision,
				to: toRevision,
				files: affectedFiles,
			}),
		),
		{include, exclude},
	);

	if (printOnly) {
		context.logger.info(affectedProjects.join('\n'));
	}

	if (printOnly || !affectedProjects.length) {
		return;
	}

	await glob(
		{
			...opts,
			include: affectedProjects,
		},
		context,
	);
}
