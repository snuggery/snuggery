import type {BuilderContext} from '@angular-devkit/architect';
import {findWorkspace, scheduleTarget} from '@snuggery/architect';
import {filterByPatterns} from '@snuggery/core';
import {join} from 'path';
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
		files = '.',
		...targetSpec
	}: Schema,
	context: BuilderContext,
) {
	return defer(async () => {
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
					project => workspaceConfiguration.projects.get(project)!.root,
				),
			),
		);

		if (files === '' || files === '.') {
			return projectRoots;
		} else if (typeof files === 'string') {
			return projectRoots.map(root => join(root, files));
		} else {
			return projectRoots.flatMap(root => files.map(file => join(root, file)));
		}
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
