import {isJsonObject, JsonObject} from "@snuggery/core";

import {hasConfiguredCollection} from "./configured-collections";
import type {DoctorContext} from "./context";

export async function checkDefaultCollections({
	workspace,
	report,
	schematics: {engineHost},
}: DoctorContext) {
	for (const [name, project] of workspace.projects) {
		if (!hasDefaultCollection(project)) {
			continue;
		}

		if (hasConfiguredCollection(project)) {
			report.reportError(
				`Project ${JSON.stringify(
					name,
				)} defines both "configuredCollections" and "defaultCollection", the "defaultCollection" will be ignored.`,
			);

			continue;
		}

		report.reportWarning(
			`Project ${JSON.stringify(
				name,
			)} defines a "defaultCollection". This is deprecated, use "configuredCollections" instead.`,
		);

		try {
			engineHost.createCollectionDescription(
				project.extensions.cli.defaultCollection,
			);
		} catch (e) {
			report.reportError(
				`The "defaultCollection" of project ${JSON.stringify(
					name,
				)} cannot be loaded: ${e instanceof Error ? e.message : String(e)}`,
			);
		}
	}

	if (hasDefaultCollection(workspace)) {
		if (hasConfiguredCollection(workspace)) {
			report.reportError(
				`The workspace defines both "configuredCollections" and "defaultCollection", the "defaultCollection" will be ignored.`,
			);

			return;
		}

		report.reportWarning(
			`The workspace defines a "defaultCollection". This is deprecated, use "configuredCollections" instead.`,
		);

		try {
			engineHost.createCollectionDescription(
				workspace.extensions.cli.defaultCollection,
			);
		} catch (e) {
			report.reportError(
				`The workspace's "defaultCollection" cannot be loaded: ${
					e instanceof Error ? e.message : String(e)
				}`,
			);
		}
	}
}

function hasDefaultCollection(pow: {
	extensions: JsonObject;
}): pow is {extensions: {cli: {defaultCollection: string}}} {
	return (
		isJsonObject(pow.extensions.cli) &&
		typeof pow.extensions.cli.defaultCollection === "string"
	);
}
