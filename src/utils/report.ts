/**
 * A heavily simplified version of Yarn's StreamReport found at
 * https://github.com/yarnpkg/berry/blob/14027c/packages/yarnpkg-core/sources/StreamReport.ts
 *
 * Copyright (c) 2016-present, Yarn Contributors. All rights reserved.
 * Licensed under the BSD 2-Clause License, https://github.com/yarnpkg/berry/blob/14027c/LICENSE.md
 */

import sliceAnsi from '@arcanis/slice-ansi';
import {Instance as ChalkCtor, Chalk, supportsColor} from 'chalk';
import type {Writable} from 'stream';
import stripAnsi from 'strip-ansi';
import type {WriteStream} from 'tty';

export type ReportOptions = {
  cli: {
    error(err: any): string;
    enableColors: boolean;
  };
  stdout: Writable;
  json?: boolean;
};

export class Report {
  static async start(
    opts: ReportOptions,
    cb: (report: Report) => Promise<void>,
  ) {
    const report = new this(opts);

    const emitWarning = process.emitWarning;
    process.emitWarning = (message, name) => {
      if (typeof message !== `string`) {
        const error = message;

        message = error.message;
        name = name ?? error.name;
      }

      const fullMessage =
        typeof name !== `undefined` ? `${name}: ${message}` : message;

      report.reportWarning(fullMessage);
    };

    try {
      await cb(report);
    } catch (error) {
      report.reportError(opts.cli.error(error));
    } finally {
      process.emitWarning = emitWarning;
    }

    return report;
  }

  private readonly json: boolean;

  private readonly stdout: Writable;

  private readonly isTty: boolean;

  private readonly supportsColor: boolean;

  private readonly chalk: Chalk;

  constructor({cli, stdout, json = false}: ReportOptions) {
    this.json = json;
    this.stdout = stdout;
    this.isTty = (stdout as WriteStream).isTTY ?? false;
    this.supportsColor =
      cli.enableColors && supportsColor && supportsColor.level > 0;
    this.chalk = new ChalkCtor({
      level: cli.enableColors ? (supportsColor && supportsColor.level) || 0 : 0,
    });
  }

  reportSeparator() {
    this.writeLine(``);
  }

  reportDebug(text: string) {
    if (!this.json) {
      this.writeLine(text, {color: this.chalk.gray});
    } else {
      this.reportJson({
        type: `debug`,
        data: text,
      });
    }
  }

  reportInfo(text: string) {
    if (!this.json) {
      this.writeLine(text, {
        color: this.chalk.whiteBright,
      });
    } else {
      this.reportJson({
        type: `info`,
        data: text,
      });
    }
  }

  reportWarning(text: string) {
    if (!this.json) {
      this.writeLine(text, {
        color: this.chalk.yellow,
      });
    } else {
      this.reportJson({
        type: `warning`,
        data: text,
      });
    }
  }

  reportError(text: string) {
    if (!this.json) {
      this.writeLine(text, {
        truncate: false,
        color: this.chalk.red,
      });
    } else {
      this.reportJson({
        type: `error`,
        data: text,
      });
    }
  }

  reportJson(data: any) {
    if (this.json) {
      this.writeLine(JSON.stringify(data));
    }
  }

  private writeLine(
    str: string,
    {
      truncate,
      color = value => value,
    }: {truncate?: boolean; color?: (text: string) => string} = {},
  ) {
    const doColor = this.supportsColor ? color : stripAnsi;

    this.stdout.write(`${doColor(this.truncate(str, {truncate}))}\n`);
  }

  private truncate(str: string, {truncate}: {truncate?: boolean} = {}) {
    if (!this.isTty) truncate = false;

    // The -1 is to account for terminals that would wrap after
    // the last column rather before the first overwrite
    if (truncate)
      str = sliceAnsi(str, 0, (this.stdout as WriteStream).columns - 1);

    return str;
  }
}
