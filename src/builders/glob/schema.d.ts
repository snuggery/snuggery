import {JsonObject} from '@angular-devkit/core';

import {ParallelOptions, SerialOptions} from '../combine';
import {SchedulerType} from '../combine/schema';

interface AbstractSchema {
  /**
   * Project(s) to execute the target in
   *
   * This value can be a string or array of strings, either a name of a project or a glob pattern
   * matching projects.
   */
  include: string | string[];

  /**
   * Project(s) to exclude from the target execution
   *
   * This value can be a string or array of strings, either a name of a project or a glob pattern
   * matching projects.
   */
  exclude?: string | string[];

  /**
   * Options for scheduling the targets, defaults to running all targets serially
   */
  targetOptions?: SerialOptions | ParallelOptions;

  /**
   * Scheduler to use, defaults to running all targets in the glob builder's process
   */
  scheduler?: SchedulerType;

  /**
   * Extra options to pass into the target
   *
   * Any property set here overrides any configuration already present in the target or
   * configuration.
   */
  options?: JsonObject;

  /**
   * Extra options
   */
  [name: string]: unknown;
}

export interface TargetSchema extends AbstractSchema {
  /**
   * Name of the target to execute in every project
   *
   * If this value isn't set, the name of the target executing the glob builder is used instead
   */
  target?: string;

  /**
   * Configuration to use in the target, if any
   */
  configuration?: string;

  builder?: undefined;
}

export interface BuilderSchema extends AbstractSchema {
  target?: undefined;
  configuration?: undefined;

  /**
   * Name of the builder to execute, e.g. `@angular-devkit/architect:browser`.
   */
  builder: string;
}

export type Schema = TargetSchema | BuilderSchema;
