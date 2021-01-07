import {createBuilder} from '@angular-devkit/architect';
import type {JsonObject} from '@angular-devkit/core';

import {execute} from './builder';
import type {Schema} from './schema';

export default createBuilder<JsonObject & Schema>(execute);

export {execute} from './builder';
export {
  ParallelOptions,
  ParallelTarget,
  SchedulerType,
  Schema,
  SerialOptions,
  SerialTarget,
  Target,
  Type,
} from './schema';
