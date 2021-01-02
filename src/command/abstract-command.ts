import {logging, schema} from '@angular-devkit/core';
import {Command, UsageError} from 'clipanion';

import {CliWorkspace, Context} from './context';
import {Cached} from '../utils/decorator';
import type {Writable} from 'stream';

class PrettiedError extends Error {
  readonly clipanion = {type: 'none'};

  constructor(name: string, message: string) {
    super(message);
    this.name = name;
  }
}

export abstract class AbstractCommand extends Command<Context> {
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

  async catch(e: any) {
    if (e instanceof schema.SchemaValidationException) {
      const errors = e.errors
        .filter(error => error.message)
        .map(error =>
          error.dataPath
            ? `  - Input property ${error.dataPath} ${error.message}`
            : `  - Input ${error.message}`,
        );

      e = new PrettiedError(
        // Angular has the annoying tendency to not name their errors properly
        e.constructor.name,
        errors.length > 0
          ? `Schema validation failed:\n${errors.join('\n')}`
          : e.message,
      );
    }

    if (/^[A-Z].*[A-Z].*(?:Error|Exception)$/.test(e.name)) {
      // The name of the error is probably already useful
      // e.g. IllegalArgumentException, SchemaValidationException, BuildFailedError
      e.name = e.name.replace(/(?:Error|Exception)$/, '');
    }

    await super.catch(e);
  }
}
