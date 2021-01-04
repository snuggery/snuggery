import {logging, schema} from '@angular-devkit/core';
import {Command, UsageError} from 'clipanion';

import {CliWorkspace, Context} from './context';
import {Cached} from '../utils/decorator';

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
      this.context.report.reportWarning(message),
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

  async catch(e: any) {
    // Extending from the Error class is often done without overriding the name
    // property to something other than 'Error'
    if (e.name === 'Error' && e.constructor !== Error) {
      // Prevent minified code from showing something less useful than 'Error'
      if (e.constructor.name.length > 5) {
        e.name = e.constructor.name;
      }
    }

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
