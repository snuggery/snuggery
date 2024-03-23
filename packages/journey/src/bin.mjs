#!/usr/bin/env node

const [major, minor] = /** @type {[string, string]} */ (
	process.versions.node.split(".", 3)
);

if (parseInt(major) < 18 || (major === "18" && parseInt(minor) < 19)) {
	process.stderr.write(`Snuggery requires at least node version 16.10\n`);
	process.exit(1);
}

const {run} = await import("./cli.mjs");

process.exitCode = (await run()) ?? 0;
