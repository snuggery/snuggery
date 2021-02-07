import {normalize, schema, virtualFs} from '@angular-devkit/core';
import {NodeJsSyncHost} from '@angular-devkit/core/node';
import {workflow} from '@angular-devkit/schematics';
import type {FileSystemEngine} from '@angular-devkit/schematics/tools';

import type {SnuggeryEngineHost} from './engine-host';

/**
 * A workflow specifically for Node tools.
 */
export class SnuggeryWorkflow extends workflow.BaseWorkflow {
  constructor(
    _root: string,
    {
      engineHost,
      force,
      dryRun,
      registry,
    }: {
      force: boolean;
      dryRun: boolean;
      registry: schema.CoreSchemaRegistry;
      engineHost: SnuggeryEngineHost;
    },
  ) {
    const root = normalize(_root);
    const host = new virtualFs.ScopedHost(new NodeJsSyncHost(), root);

    super({
      host,
      engineHost,

      force,
      dryRun,
      registry,
    });
  }

  get engine(): FileSystemEngine {
    return this._engine as FileSystemEngine;
  }

  get engineHost(): SnuggeryEngineHost {
    return this._engineHost as SnuggeryEngineHost;
  }
}
