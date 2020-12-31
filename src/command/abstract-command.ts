import {json, logging} from '@angular-devkit/core';
import {Command, UsageError} from 'clipanion';

import {CliWorkspace, Context} from './context';
import {Cached} from '../utils/decorator';

export abstract class AbstractCommand extends Command<Context> {
  @Cached()
  protected get registry(): json.schema.SchemaRegistry {
    const registry = new json.schema.CoreSchemaRegistry();
    registry.addPostTransform(json.schema.transforms.addUndefinedDefaults);
    registry.useXDeprecatedProvider(msg => this.context.stderr.write(msg)); // TODO logging

    return registry;
  }

  protected get workspace(): CliWorkspace {
    const {workspace} = this.context;

    if (workspace == null) {
      throw new UsageError(`Couldn't find workspace configuration`);
    }

    return workspace;
  }

  protected createLogger(): logging.Logger {
    // TODO
    return new logging.Logger('to do');
  }
}
