import type {BuilderContext, BuilderOutput} from '@angular-devkit/architect';
import type {JsonObject} from '@angular-devkit/core';
import {
	mapSuccessfulResult,
	switchMapSuccessfulResult,
} from '@snuggery/architect/operators';
import type {Observable} from 'rxjs';

import {commitAndTag, isWorktreeClean} from './git';
import {applyVersion, VersionBuilderOutput} from './yarn';

export function executeVersion(
	_options: JsonObject,
	context: BuilderContext,
): Observable<BuilderOutput & (VersionBuilderOutput | {success: false})> {
	return isWorktreeClean(context).pipe(
		switchMapSuccessfulResult(() => applyVersion(context)),
		switchMapSuccessfulResult(({appliedVersions, yarn}) =>
			commitAndTag(appliedVersions, context).pipe(
				mapSuccessfulResult(
					() =>
						({success: true as const, appliedVersions, yarn} as BuilderOutput &
							VersionBuilderOutput),
				),
			),
		),
	);
}
