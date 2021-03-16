import {JsonObject} from '@angular-devkit/core';

export interface HookWithOptions {
  /**
   * The schematic to run in this hook
   */
  schematic: string;

  /**
   * Options to pass into the hook schematic
   */
  options?: JsonObject;
}

/**
 * Either the name of a schematic or an object describing a schematic with optional options
 */
export type Hook = string | HookWithOptions;

export interface Schema {
  /**
   * Schematic to run the hooks for
   */
  schematic: string;

  /**
   * Options to pass into the hook schematic
   */
  options?: JsonObject;

  /**
   * Registered hooks
   */
  hooks: {[schematic: string]: Hook[]};
}
