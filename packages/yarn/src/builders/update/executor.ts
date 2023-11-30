import {type BuilderContext, BuildFailureError} from "@snuggery/architect";

import {loadYarn} from "../../utils/yarn";

import type {Schema} from "./schema";

const snuggeryPluginName = "@yarnpkg/plugin-snuggery";

export async function executeUpdate(
	{packages}: Schema,
	context: BuilderContext,
): Promise<void> {
	const yarn = await loadYarn(context);
	if (!(await yarn.hasPlugin())) {
		throw new BuildFailureError(`Couldn't find ${snuggeryPluginName}`);
	}

	await yarn.snuggeryWorkspaceUp(packages);
}
