import type {WorkspaceDefinition} from '@snuggery/core';
import {updateWorkspace as _updateWorkspace} from '@snuggery/schematics';

import type {Trip, GeneralTransformFactory} from '../types';

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
		configure(journey) {
			journey.general.addDeduplicatedTransform(
				updateWorkspaceTransform,
				updater,
			);
		},
	};
}

const updateWorkspaceTransform: GeneralTransformFactory<
	UpdateWorkspaceInput
> = ({input}) => {
	return _updateWorkspace(async workspace => {
		for (const transform of input) {
			await transform(workspace);
		}
	});
};
