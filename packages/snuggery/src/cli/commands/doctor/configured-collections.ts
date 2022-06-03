import {isJsonObject, JsonObject} from '@snuggery/core';

import type {DoctorContext} from './context';

export async function checkConfiguredCollections({
	workspace,
	report,
	schematics: {engineHost},
}: DoctorContext) {
	for (const [name, project] of workspace.projects) {
		if (!hasConfiguredCollection(project)) {
			continue;
		}

		for (const collection of project.extensions.cli.configuredCollections) {
			try {
				engineHost.createCollectionDescription(collection);
			} catch (e) {
				report.reportError(
					`The "configuredCollections" of project ${JSON.stringify(
						name,
					)} contains ${JSON.stringify(collection)} which cannot be loaded: ${
						e instanceof Error ? e.message : String(e)
					}`,
				);
			}
		}
	}

	if (hasConfiguredCollection(workspace)) {
		for (const collection of workspace.extensions.cli.configuredCollections) {
			try {
				engineHost.createCollectionDescription(collection);
			} catch (e) {
				report.reportError(
					`The "configuredCollections" of the workspace contains ${JSON.stringify(
						collection,
					)} which cannot be loaded: ${
						e instanceof Error ? e.message : String(e)
					}`,
				);
			}
		}
	}
}

export function hasConfiguredCollection(pow: {
	extensions: JsonObject;
}): pow is {extensions: {cli: {configuredCollections: string[]}}} {
	return (
		isJsonObject(pow.extensions.cli) &&
		Array.isArray(pow.extensions.cli.configuredCollections)
	);
}
