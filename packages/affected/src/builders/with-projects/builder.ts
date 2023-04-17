import {
	type BuilderContext,
	lastValueFrom,
	scheduleTarget,
} from '@snuggery/architect';
import {filterByPatterns} from '@snuggery/core';

import {findAffectedProjects} from '../../changes';

import type {Schema} from './schema';

function hasTarget(value: unknown): value is {target: string} {
	return typeof (value as {target: string}).target === 'string';
}

export async function execute(
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

	await lastValueFrom(
		context,
		scheduleTarget(
			hasTarget(targetSpec) ? targetSpec.target : targetSpec,
			{[optionName]: affectedProjects},
			context,
		),
	);
}
