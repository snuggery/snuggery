/* cspell:ignore jsons */
import type {JsonObject} from '@snuggery/core';
import {walkTree} from '@snuggery/schematics';

import type {Trip, GeneralTransformFactory} from '../types';

interface UpdatePackageJsonsInput {
	exclude?: string | string[];
	update(packageJson: JsonObject, path: string): void | Promise<void>;
}

/**
 * Update all `package.json` files in the project
 *
 * @returns A trip to register in a `journey`
 */
export function updatePackageJsons(
	updater: UpdatePackageJsonsInput | UpdatePackageJsonsInput['update'],
): Trip {
	return {
		configure(journey) {
			journey.general.addDeduplicatedTransform(
				updateWorkspaceTransform,
				typeof updater === 'function' ? {update: updater} : updater,
			);
		},
	};
}

const updateWorkspaceTransform: GeneralTransformFactory<
	UpdatePackageJsonsInput
> =
	({input}) =>
	async tree => {
		const exclude = input.flatMap(input => input.exclude || []);
		for (const file of walkTree(tree, {include: '**/package.json', exclude})) {
			const rawContent = tree.readText(file);
			const content = JSON.parse(rawContent) as JsonObject;

			for (const {update} of input) {
				await update(content, file);
			}

			const leadingWhitespace = rawContent.slice(0, rawContent.indexOf('{'));
			const trailingWhitespace = rawContent.slice(
				rawContent.lastIndexOf('}') + 1,
			);
			const indentation = /(?<=\{[\r\n]+)[ \t]+/.exec(rawContent)?.[0];

			tree.overwrite(
				file,
				`${leadingWhitespace}${JSON.stringify(
					content,
					null,
					indentation,
				)}${trailingWhitespace}`,
			);
		}
	};
