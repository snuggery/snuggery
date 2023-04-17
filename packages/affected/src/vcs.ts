import type {BuilderContext} from '@snuggery/architect';

import type {VersionControlFactory, VersionControlSystem} from './vcs/abstract';
import {GitRepository} from './vcs/git';

const factories: VersionControlFactory[] = [GitRepository];

export {VersionControlSystem};

export async function createVersionControlSystem(
	context: BuilderContext,
): Promise<VersionControlSystem> {
	for (const factory of factories) {
		const vcs = await factory.create({location: context.workspaceRoot});

		if (vcs != null) {
			return vcs;
		}
	}

	throw new Error(
		`Failed to find version control system in ${context.workspaceRoot}\nNote @snuggery/affected currently only supports repositories where the repository root folder and the workspace root folder are one and the same`,
	);
}
