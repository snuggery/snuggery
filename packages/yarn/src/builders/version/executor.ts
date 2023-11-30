import type {BuilderContext} from "@snuggery/architect";
import type {JsonObject} from "@snuggery/core";

import {commitAndTag, validateWorktreeIsClean} from "./git";
import {applyVersion, VersionBuilderOutput} from "./yarn";

export async function executeVersion(
	_options: JsonObject,
	context: BuilderContext,
): Promise<VersionBuilderOutput> {
	await validateWorktreeIsClean(context);

	const {yarn, appliedVersions} = await applyVersion(context);
	await commitAndTag(appliedVersions, context);

	return {yarn, appliedVersions};
}
