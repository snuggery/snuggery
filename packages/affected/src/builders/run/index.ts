import {createBuilder} from "@snuggery/architect";
import type {JsonObject} from "@snuggery/core";

import {execute} from "./builder";
import type {Schema} from "./schema";

export {execute, type Schema};

export default createBuilder<JsonObject & Schema>(execute);
