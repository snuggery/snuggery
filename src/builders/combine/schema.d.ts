import {JsonObject} from '@angular-devkit/core';
import {TargetSpecifier as SingleTarget} from '@bgotink/atelier/builder-utils/builder-utils';

export const enum Type {
  Serial = 'serial',
  Parallel = 'parallel',
}

export const enum SchedulerType {
  /**
   * Run all scheduled tasks and builders in the master process
   */
  InProcess = 'in process',

  /**
   * Spawn a number of processes (defined by `maxParallel` in the parallel options) to run the
   * scheduled tasks and builders in
   */
  Spawn = 'spawn',

  /**
   * Spawn a number of worker threads (defined by `maxParallel` in the parallel options) to run the
   * scheduled tasks and builders in
   */
  Worker = 'worker',

  /**
   * Spawn a new process for every scheduled task or builder
   */
  Respawn = 'respawn',
}

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
