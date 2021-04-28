import type {JsonObject} from '@angular-devkit/core';
import {externalSchematic, Rule} from '@angular-devkit/schematics';

import type {Hook} from '../schematics/hook/schema';

import {updateWorkspace} from './workspace';

/**
 * Run all hooks for the given schematics
 *
 * @param schematic The schematic to run hooks for
 * @param options The options to pass into the hooked schematics
 * @param scope The scope for the schematic, if any
 */
export function runHooks(
  schematic: string,
  options?: JsonObject,
  scope?: string,
): Rule {
  return externalSchematic(
    '@snuggery/schematics',
    'hook',
    {schematic, options},
    {scope},
  );
}

/**
 * Register the given hook for the given schematic
 *
 * @param schematic The schematic to add the hook for
 * @param hook The hook to register for the schematic
 */
export function registerHook(schematic: string, hook: Hook): Rule {
  return updateWorkspace(workspace => {
    if (workspace.extensions.schematics == null) {
      workspace.extensions.schematics = Object.create(null) as JsonObject;
    }

    const schematics = workspace.extensions.schematics as JsonObject;

    if (schematics['@snuggery/schematics:hook'] == null) {
      schematics['@snuggery/schematics:hook'] = Object.create(
        null,
      ) as JsonObject;
    }

    const hookConfig = schematics['@snuggery/schematics:hook'] as {
      hooks?: {[schematic: string]: Hook[]};
    };

    if (hookConfig.hooks == null) {
      hookConfig.hooks = {};
    }

    (hookConfig.hooks[schematic] ??= []).push(hook);
  });
}
