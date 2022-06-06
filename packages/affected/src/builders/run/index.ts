import {createBuilder} from '@angular-devkit/architect';
import type {JsonObject} from '@angular-devkit/core';

import {execute} from './builder';
import type {Schema} from './schema';

export {execute, type Schema};

export default createBuilder<JsonObject & Schema>(execute);
