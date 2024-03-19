import {createBuilder} from "@snuggery/architect";
import type {JsonObject} from "@snuggery/core";

import {execute} from "./builder.js";
import type {Schema} from "./schema.js";

export {execute, type Schema};

export default createBuilder<JsonObject & Schema>(execute);
