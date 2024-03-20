#!/usr/bin/env node

import type {PnpApi} from "@yarnpkg/pnp";
import {promises as fs} from "node:fs";
import {createRequire} from "node:module";
import {dirname, join, parse as parsePath} from "node:path";

const [major, minor] = process.version.replace(/^v/, "").split(".") as [
	string,
	string,
];

if (parseInt(major) < 16 || (major === "16" && parseInt(minor) < 10)) {
	process.stderr.write(`Snuggery requires at least node version 16.10\n`);
	process.exit(1);
}

const startCwd = process.cwd();

import("@snuggery/snuggery/cli")
	.then(async function (globalSnuggery): Promise<
		Pick<typeof import("@snuggery/snuggery/cli"), "findWorkspace" | "run">
	> {
		const workspace = (await globalSnuggery.findWorkspace(startCwd))?.path;

		if (workspace == null) {
			return globalSnuggery;
		}

		const workspaceFolder = dirname(workspace);

		if (process.versions.pnp == null) {
			const pnpFile = await findUp(
				[".pnp.js", ".pnp.cjs"],
				// Fallback to old property name to prevent breaking
				// combination of old global + new local or vice versa
				workspaceFolder,
			);

			if (pnpFile != null) {
				const pnpapi = require(pnpFile) as PnpApi & {setup?: () => void};

				if (typeof pnpapi.setup === "function") {
					pnpapi.setup();
				}

				const pnpRequire = `--require ${
					/\s/.test(pnpFile) ? JSON.stringify(pnpFile) : pnpFile
				}`;
				process.env.NODE_OPTIONS = process.env.NODE_OPTIONS
					? `${process.env.NODE_OPTIONS} ${pnpRequire}`
					: pnpRequire;
			}
		}

		try {
			const require = createRequire(
				// Fallback to old property name to prevent breaking
				// combination of old global + new local or vice versa
				join(workspaceFolder, "<workspace>"),
			);
			const localCli =
				require("@snuggery/snuggery/cli") as typeof import("@snuggery/snuggery/cli");

			if (
				typeof localCli.run === "function" &&
				typeof localCli.findWorkspace === "function"
			) {
				return localCli;
			}

			// The cli endpoint doesn't expose a run function? Probably a newer version that changed the
			// main entry point.
		} catch {
			// ignore
		}

		return globalSnuggery;
	})
	.then(async ({findWorkspace, run}) =>
		run(process.argv.slice(2), {
			startCwd,
			workspace: (await (await findWorkspace(startCwd))?.workspace()) ?? null,
			globalManifest: require.resolve("@snuggery/global/package.json"),
		}),
	)
	.catch((e) => {
		process.stderr.write(`Failed to start Snuggery:\n\n${e?.stack ?? e}`);
		return 1;
	})
	.then((returnCode) => process.exit(returnCode));

async function findUp(
	names: string | string[],
	from: string,
): Promise<string | null> {
	if (!Array.isArray(names)) {
		names = [names];
	}
	const root = parsePath(from).root;

	let currentDir = from;
	while (currentDir && currentDir !== root) {
		for (const name of names) {
			const p = join(currentDir, name);
			try {
				if ((await fs.stat(p)).isFile()) {
					return p;
				}
			} catch {
				// ignore any error
				// continue to the next filename / folder
			}
		}

		currentDir = dirname(currentDir);
	}

	return null;
}
