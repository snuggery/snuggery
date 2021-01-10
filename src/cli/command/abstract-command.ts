import {logging, schema} from '@angular-devkit/core';
import {Command, UsageError} from 'clipanion';

import {Cached} from '../utils/decorator';
import {Format, richFormat, textFormat} from '../utils/format';
import type {Report} from '../utils/report';

import type {CliWorkspace, Context} from './context';

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
      const err = new UsageError(`Couldn't find any workspace configuration`);
      err.clipanion.type = 'none';
      throw err;
    }

    return workspace;
  }

  protected get currentProject(): string | null {
    const {workspace, startCwd} = this.context;

    return (
      workspace?.tryGetProjectNameByCwd(startCwd, message =>
        this.context.report.reportWarning(message),
      ) ?? null
    );
  }

  @Cached()
  protected get logger(): logging.Logger {
    const logger = new logging.Logger('');

    const {report} = this.context;
    const method = {
      debug: report.reportDebug,
      info: report.reportInfo,
      warn: report.reportWarning,
      error: report.reportError,
      fatal: report.reportError,
    } as const;

    logger.subscribe(entry => {
      (method[entry.level] ?? method.info).call(report, entry.message);
    });

    return logger;
  }

  protected get report(): Report {
    return this.context.report;
  }

  protected get format(): Format {
    return this.cli.enableColors ? richFormat : textFormat;
  }

  async catch(e: unknown): Promise<void> {
    if (!(e instanceof Error)) {
      return super.catch(e);
    }

    let error = e;

    // Extending from the Error class is often done without overriding the name
    // property to something other than 'Error'
    if (error.name === 'Error' && error.constructor !== Error) {
      // Prevent minified code from showing something less useful than 'Error'
      if (error.constructor.name.length > 5) {
        error.name = error.constructor.name;
      }
    }

    if (error instanceof schema.SchemaValidationException) {
      const errors = error.errors
        .filter(error => error.message)
        .map(error =>
          error.dataPath
            ? `  - Input property ${error.dataPath} ${error.message}`
            : `  - Input ${error.message}`,
        );

      error = new PrettiedError(
        // Angular has the annoying tendency to not name their errors properly
        error.constructor.name,
        errors.length > 0
          ? `Schema validation failed:\n${errors.join('\n')}`
          : error.message,
      );
    }

    if (/^[A-Z].*[A-Z].*(?:Error|Exception)$/.test(error.name)) {
      // The name of the error is probably already useful
      // e.g. IllegalArgumentException, SchemaValidationException, BuildFailedError
      error.name = error.name.replace(/(?:Error|Exception)$/, '');
    }

    await super.catch(error);
  }
}
