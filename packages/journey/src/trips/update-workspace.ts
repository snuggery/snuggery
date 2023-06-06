import type {WorkspaceDefinition} from '@snuggery/core';
import type {Trip} from '@snuggery/journey';
import {
	type TreeVisitorWithInput,
	visitTree,
} from '@snuggery/journey/agents/general';
import {updateWorkspace as _updateWorkspace} from '@snuggery/schematics';

interface UpdateWorkspaceInput {
	(workspace: WorkspaceDefinition): void | Promise<void>;
}

/**
 * Update the workspace definition (`angular.json`, `workspace.json`, `snuggery.kdl`)
 *
 * @returns A trip to register in a `journey`
 */
export function updateWorkspace(updater: UpdateWorkspaceInput): Trip {
	return {
		prepare(journey) {
			visitTree(journey, updateWorkspaceTransform, updater);
		},
	};
}

const updateWorkspaceTransform: TreeVisitorWithInput<
	UpdateWorkspaceInput
> = async (input, tree) =>
	await _updateWorkspace(async workspace => {
		for (const transform of input) {
			await transform(workspace);
		}
	})(tree);
