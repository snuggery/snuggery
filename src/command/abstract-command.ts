import {json, logging} from '@angular-devkit/core';
import {Command, UsageError} from 'clipanion';

import {CliWorkspace, Context} from './context';
import {Cached} from '../utils/decorator';
import type {Writable} from 'stream';

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

  protected get currentProject() {
    const {
      workspace,
      context: {startCwd},
    } = this;

    return workspace.tryGetProjectNameByCwd(startCwd, message =>
      this.logger.warn(message),
    );
  }

  @Cached()
  protected get logger(): logging.Logger {
    const logger = new logging.Logger('');

    const out: {[level in logging.LogLevel]?: Writable} = {
      info: this.context.stdout,
      debug: this.context.stdout,
    };

    logger.subscribe(entry => {
      (out[entry.level] ?? this.context.stderr).write(entry.message + '\n');
    });

    return logger;
  }
}
