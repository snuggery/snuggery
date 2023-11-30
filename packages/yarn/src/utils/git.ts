import {type BuilderContext, BuildFailureError} from "@snuggery/architect";
import {spawn} from "node:child_process";

export function git(args: string[], context: BuilderContext): Promise<void> {
	return new Promise((resolve, reject) => {
		const child = spawn("git", args, {
			cwd: context.workspaceRoot,
			env: process.env,
			stdio: "inherit",
		});

		child.addListener("close", (code, signal) => {
			if (signal) {
				reject(new BuildFailureError(`Git exited with signal ${signal}`));
			} else if (code) {
				reject(new BuildFailureError(`Git exited with exit code ${code}`));
			} else {
				resolve();
			}
		});

		context.addTeardown(() => {
			child.kill();
		});
	});
}
