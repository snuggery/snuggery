import {isJsonArray} from '@snuggery/core';

import {createVersionControlSystem} from '../vcs';

import type {ChangeLocatorStrategy} from './interface';

/**
 * Strategy that uses the version control system to find files that have
 * been changed.
 *
 * This strategy should be the first to be executed
 */
export const changedFilesStrategy: ChangeLocatorStrategy = {
	async findAffectedFiles({context, locatorConfigurations}, affectedFiles) {
		let from: string | undefined;
		let to: string | undefined;
		const exclude: string[] = [];

		for (const config of locatorConfigurations) {
			if (typeof config.from === 'string' || config.from === null) {
				from = config.from ?? undefined;
			}
			if (typeof config.to === 'string' || config.to === null) {
				to = config.to ?? undefined;
			}

			if (isJsonArray(config.exclude)) {
				for (const ex of config.exclude) {
					if (typeof ex === 'string') {
						exclude.push(ex);
					}
				}
			}
		}

		for (const file of await (
			await createVersionControlSystem(context)
		).getChangedFiles({
			from,
			to,
			exclude,
		})) {
			affectedFiles.add(file);
		}
	},
};
