import {createBuilder} from '@angular-devkit/architect';
import type {JsonObject} from '@snuggery/core';

import {execute} from './builder';
import type {Schema} from './schema';

export default createBuilder<JsonObject & Schema>(execute);

export {execute} from './builder';
export type {
	ParallelOptions,
	ParallelTarget,
	Schema,
	SerialOptions,
	SerialTarget,
	Target,
} from './schema';
export {SchedulerType, Type} from './types';
