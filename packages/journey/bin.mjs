#!/usr/bin/env node
// This endpoint is only used in this repo itself, which makes it the perfect
// spot for adding the option for tests to inject answers to user input

import {env} from "node:process";
import {register} from "node:module";
import prompt from "prompts";

await import("@snuggery-workspace/scripts/load-ts");

const traceCli =
	process.argv.length === 3 &&
	process.argv[2] === "--validate-cli-dependencies";

register("@snuggery-workspace/scripts/loader", import.meta.url, {
	data: {traceCli},
});

if (env.JOURNEY_INJECT) {
	prompt.inject(JSON.parse(env.JOURNEY_INJECT));
}

await import("./src/bin.mjs");
