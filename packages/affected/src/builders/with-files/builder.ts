import {scheduleTarget, lastValueFrom} from '@snuggery/architect';
import type {BuilderContext} from '@snuggery/architect/create-builder';
import {filterByPatterns} from '@snuggery/core';

import {findAffectedFiles} from '../../changes';

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
		optionName,
		...targetSpec
	}: Schema,
	context: BuilderContext,
) {
	const affectedFiles = filterByPatterns(
		Array.from(
			await findAffectedFiles(context, {
				from: fromRevision,
				to: toRevision,
			}),
		),
		{include, exclude},
	);

	if (printOnly) {
		context.logger.info(affectedFiles.join('\n'));
	}

	if (printOnly || !affectedFiles.length) {
		return;
	}

	await lastValueFrom(
		context,
		scheduleTarget(
			hasTarget(targetSpec) ? targetSpec.target : targetSpec,
			{[optionName]: affectedFiles},
			context,
		),
	);
}
