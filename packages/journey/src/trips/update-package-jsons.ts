/* cspell:ignore jsons */
import {type JsonObject, matchesPatterns} from '@snuggery/core';
import type {Trip} from '@snuggery/journey';
import {
	type TreeVisitorWithInput,
	visitTree,
} from '@snuggery/journey/agents/general';
import {walkTree} from '@snuggery/schematics';

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
		prepare(journey) {
			visitTree(
				journey,
				updateWorkspaceTransform,
				typeof updater === 'function' ? {update: updater} : updater,
			);
		},
	};
}

const updateWorkspaceTransform: TreeVisitorWithInput<
	UpdatePackageJsonsInput
> = async (input, tree) => {
	for (const file of walkTree(tree, {include: '**/package.json'})) {
		const rawContent = tree.readText(file);
		const content = JSON.parse(rawContent) as JsonObject;
		let edited = false;

		for (const {update, exclude} of input) {
			if (exclude && matchesPatterns(file, {include: exclude})) {
				continue;
			}

			await update(content, file);
			edited = true;
		}

		if (!edited) {
			continue;
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
