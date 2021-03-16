import type {JsonObject} from '@angular-devkit/core';
import {
  chain,
  externalSchematic,
  noop,
  Rule,
  SchematicsException,
} from '@angular-devkit/schematics';

import type {Schema} from './schema';

/**
 * Run hooks for a given schematic
 */
export default function ({
  hooks,
  schematic,
  options: hookOptions,
}: Schema): Rule {
  const schematicHook = hooks[schematic];

  if (schematicHook == null) {
    return noop();
  }

  return chain(
    schematicHook.map(hook => {
      let options: JsonObject | undefined;
      let schematic: string;

      if (typeof hook === 'string') {
        schematic = hook;
        options = {};
      } else {
        ({options, schematic} = hook);
      }

      const [collectionName, schematicName] = schematic.split(':', 2) as [
        string,
        string | undefined,
      ];

      if (schematicName == null) {
        throw new SchematicsException(
          `Expected a valid schematic name, got ${JSON.stringify(schematic)}`,
        );
      }

      return externalSchematic(collectionName!, schematicName, {
        ...options,
        ...hookOptions,
      });
    }),
  );
}
