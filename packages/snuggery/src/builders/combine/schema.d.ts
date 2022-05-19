import {TargetSpecifier as SingleTarget} from '@snuggery/architect';
import {JsonObject} from '@snuggery/core';

import {SchedulerType, Type} from './types';

export interface SerialOptions {
	type: Type.Serial;
}

export interface ParallelOptions {
	type: Type.Parallel;

	maxParallel?: number | string;
}

export interface SerialTarget extends SerialOptions {
	targets: Target[];
}

export interface ParallelTarget extends ParallelOptions {
	targets: Target[];
}

export type Target = SingleTarget | SerialTarget | ParallelTarget;

export interface Schema {
	/**
	 * The targets to build
	 */
	targets: Target[] | SerialTarget | ParallelTarget;

	/**
	 * Options to pass into the targets
	 *
	 * Note that the same options are passed to all targets, so they'll all have to support it
	 */
	options?: JsonObject;

	/**
	 * The scheduler to use
	 */
	scheduler?: SchedulerType;

	/**
	 * Extra options
	 */
	[name: string]: unknown;
}
