#!/usr/bin/env node

await import("@snuggery-workspace/scripts/load-ts");

Error.stackTraceLimit = Infinity;

await import("./src/bin.ts");
