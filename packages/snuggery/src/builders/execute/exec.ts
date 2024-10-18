import {
	BuildFailureError,
	type BuilderContext,
	type BuilderOutput,
} from "@snuggery/architect";
import {fork, spawn, ForkOptions, ChildProcess} from "child_process";
import {extname} from "path";

import type {Schema} from "./schema.js";

/**
 * Execute a binary
 *
 * @param cwd The working directory for the spawned process
 * @param binary Path for the binary to spawn
 * @param options Options
 */
export async function exec(
	context: BuilderContext,
	cwd: string,
	binary: string,
	{stdio = "inherit", env = {}, arguments: args = []}: Schema,
): Promise<BuilderOutput> {
	const childOptions: ForkOptions = {
		cwd,
		stdio,
		env: {
			...process.env,
			...env,
		},
	};

	let child: ChildProcess;
	if (/^\.[cm]?js$/.test(extname(binary))) {
		if (Array.isArray(childOptions.stdio)) {
			childOptions.stdio.push("ipc");
		}

		child = fork(binary, args, childOptions);
	} else {
		child = spawn(binary, args, childOptions);
	}

	context.addTeardown(() => {
		child.kill();
	});

	return new Promise((resolve, reject) => {
		child.addListener("close", (code, signal) => {
			if (signal) {
				reject(new BuildFailureError(`Command exited with signal ${signal}`));
			} else if (code) {
				reject(new BuildFailureError(`Command exited with exit code ${code}`));
			} else {
				resolve({
					success: true,
				});
			}
		});
	});
}
