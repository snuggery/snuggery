import {
	type BuilderContext,
	BuildFailureError,
} from '@snuggery/architect/create-builder';

import {git} from '../../utils/git';
import type {AppliedVersion} from '../../utils/yarn';

export async function validateWorktreeIsClean(
	context: BuilderContext,
): Promise<void> {
	try {
		await Promise.all([
			git(['diff', '--quiet', '--exit-code'], context),
			git(['diff', '--cached', '--quiet', '--exit-code'], context),
		]);
	} catch {
		throw new BuildFailureError(
			"Git working tree isn't clean, commit or stash all changes before tagging a version",
		);
	}
}

export async function commitAndTag(
	appliedVersions: AppliedVersion[],
	context: BuilderContext,
): Promise<void> {
	await git(
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
		context,
	);

	for (const {ident, newVersion} of appliedVersions) {
		await git(
			['tag', `${ident}@${newVersion}`, '--message', `${ident}@${newVersion}`],
			context,
		);
	}
}
