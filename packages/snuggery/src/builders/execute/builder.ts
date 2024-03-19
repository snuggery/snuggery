import {
	type BuilderContext,
	getProjectPath,
	resolveWorkspacePath,
} from "@snuggery/architect";

import {exec} from "./exec.js";
import {resolvePackageBin} from "./resolve-package-bin.js";
import type {Schema, PackageBinarySchema} from "./schema.js";

/**
 * Execute a binary, depending on config either globally installed or installed in a node package
 */
export async function execute(
	config: Schema,
	context: BuilderContext,
): Promise<void> {
	const cwd = config.cwd
		? resolveWorkspacePath(context, config.cwd)
		: await getProjectPath(context);

	let binary: string;

	if (!isPackageConfiguration(config)) {
		binary = config.binary;
	} else {
		binary = await resolvePackageBin(context, {
			packageName: config.package,
			binary: config.binary,
			resolveFrom: config.resolveFrom,
		});
	}

	await exec(context, cwd, binary, config);
}

function isPackageConfiguration(config: Schema): config is PackageBinarySchema {
	return "package" in config && !!config.package;
}
