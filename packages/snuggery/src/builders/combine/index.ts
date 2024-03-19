import {createBuilder} from "@snuggery/architect";
import type {JsonObject} from "@snuggery/core";

import {execute} from "./builder.js";
import type {Schema} from "./schema.js";

export default createBuilder<JsonObject & Schema>(execute);

export {execute} from "./builder.js";
export type {
	ParallelOptions,
	ParallelTarget,
	Schema,
	SerialOptions,
	SerialTarget,
	Target,
} from "./schema.js";
export {SchedulerType, Type} from "./types.js";
