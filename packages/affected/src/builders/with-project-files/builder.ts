import {
	type BuilderContext,
	findWorkspace,
	lastValueFrom,
	scheduleTarget,
} from '@snuggery/architect';
import {filterByPatterns} from '@snuggery/core';
import {join} from 'node:path';

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
		files = '.',
		...targetSpec
	}: Schema,
	context: BuilderContext,
) {
	const workspaceConfiguration = await findWorkspace(context);

	const affectedProjects = Array.from(
		await findAffectedProjects(context, {
			from: fromRevision,
			to: toRevision,
			files: affectedFiles,
			workspaceConfiguration,
		}),
	);

	const projectRoots = Array.from(
		new Set(
			filterByPatterns(affectedProjects, {include, exclude}).map(
				(project) => workspaceConfiguration.projects.get(project)!.root,
			),
		),
	);

	let affectedProjectFiles;
	if (files === '' || files === '.') {
		affectedProjectFiles = projectRoots;
	} else if (typeof files === 'string') {
		affectedProjectFiles = projectRoots.map((root) => join(root, files));
	} else {
		affectedProjectFiles = projectRoots.flatMap((root) =>
			files.map((file) => join(root, file)),
		);
	}

	if (printOnly) {
		context.logger.info(affectedProjectFiles.join('\n'));
	}

	if (printOnly || !affectedProjectFiles.length) {
		return;
	}

	await lastValueFrom(
		context,
		scheduleTarget(
			hasTarget(targetSpec) ? targetSpec.target : targetSpec,
			{[optionName]: affectedProjectFiles},
			context,
		),
	);
}
