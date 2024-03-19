#!/usr/bin/env node

import {register} from "module";

await import("@snuggery-workspace/scripts/load-ts");

const traceCli =
	process.argv.length === 3 &&
	process.argv[2] === "--validate-cli-dependencies";

register("@snuggery-workspace/scripts/loader", import.meta.url, {
	data: {traceCli},
});

Error.stackTraceLimit = Infinity;

await import("./src/bin.ts");
