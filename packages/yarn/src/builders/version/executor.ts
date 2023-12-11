import type {BuilderContext} from "@snuggery/architect";

import {commitAndTag, validateWorktreeIsClean} from "./git";
import type {Schema} from "./schema";
import {applyVersion, VersionBuilderOutput} from "./yarn";

export async function executeVersion(
	{dryRun = false, prerelease}: Schema,
	context: BuilderContext,
): Promise<VersionBuilderOutput> {
	if (!dryRun) {
		await validateWorktreeIsClean(context);
	}

	const {yarn, appliedVersions} = await applyVersion(context, {
		dryRun,
		prerelease,
	});
	if (!dryRun) {
		await commitAndTag(appliedVersions, context);
	}

	return {yarn, appliedVersions};
}
