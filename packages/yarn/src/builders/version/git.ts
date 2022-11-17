import type {BuilderContext, BuilderOutput} from '@angular-devkit/architect';
import {concat, forkJoin, of, Observable} from 'rxjs';
import {catchError, last, mapTo} from 'rxjs/operators';

import {git} from '../../utils/git';
import type {AppliedVersion} from '../../utils/yarn';

export function isWorktreeClean({
	workspaceRoot,
}: BuilderContext): Observable<BuilderOutput> {
	return forkJoin([
		git(['diff', '--quiet', '--exit-code'], {root: workspaceRoot}),
		git(['diff', '--cached', '--quiet', '--exit-code'], {root: workspaceRoot}),
	]).pipe(
		mapTo({success: true}),
		catchError(() =>
			of({
				success: false,
				error:
					"Git working tree isn't clean, commit or stash all changes before tagging a version",
			}),
		),
	);
}

export function commitAndTag(
	appliedVersions: AppliedVersion[],
	{workspaceRoot}: BuilderContext,
): Observable<BuilderOutput> {
	return concat(
		git(
			[
				'commit',
				'--all',
				'--message',
				`{chore} release ${appliedVersions.length} package${
					appliedVersions.length > 1 ? 's' : ''
				}\n\n${appliedVersions
					.map(
						line => `- ${line.ident}: ${line.oldVersion} -> ${line.newVersion}`,
					)
					.join('\n')}\n`,
			],
			{root: workspaceRoot},
		),

		...appliedVersions.map(({ident, newVersion}) =>
			git(
				[
					'tag',
					`${ident}@${newVersion}`,
					'--message',
					`${ident}@${newVersion}`,
				],
				{root: workspaceRoot},
			),
		),
	).pipe(
		last(),
		mapTo({success: true}),
		catchError(err =>
			of({
				success: false,
				error: err.message,
			}),
		),
	);
}
