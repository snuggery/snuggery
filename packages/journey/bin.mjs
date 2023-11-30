#!/usr/bin/env node
// This endpoint is only used in this repo itself, which makes it the perfect
// spot for adding the option for tests to inject answers to user input

import {env} from "node:process";
import prompt from "prompts";

if (env.JOURNEY_INJECT) {
	prompt.inject(JSON.parse(env.JOURNEY_INJECT));
}

await import("./src/bin.mjs");
