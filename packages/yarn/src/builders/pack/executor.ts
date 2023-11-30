import {
	type BuilderContext,
	BuildFailureError,
	getProjectPath,
	resolveWorkspacePath,
} from "@snuggery/architect";

import {loadYarn, snuggeryPluginName} from "../../utils/yarn";

import type {Schema} from "./schema";

export async function executePack(
	{directory, useWorkspacePlugin}: Schema,
	context: BuilderContext,
): Promise<void> {
	const yarn = await loadYarn(context);
	const hasPlugin = await yarn.hasPlugin();

	if (useWorkspacePlugin && !hasPlugin) {
		throw new BuildFailureError(`Couldn't find ${snuggeryPluginName}`);
	}

	const cwd = await getProjectPath(context);
	const directoryToPack = directory
		? resolveWorkspacePath(context, directory)
		: cwd;

	if (
		useWorkspacePlugin === true ||
		(useWorkspacePlugin !== false && hasPlugin && directoryToPack !== cwd)
	) {
		await yarn.snuggeryWorkspacePack({
			cwd,
			directoryToPack,
		});
	} else {
		if (directoryToPack !== cwd) {
			throw new Error(
				`Packing a folder other than the workspace requires the ${snuggeryPluginName} yarn plugin to be installed`,
			);
		}

		await yarn.npmPack({cwd});
	}
}
