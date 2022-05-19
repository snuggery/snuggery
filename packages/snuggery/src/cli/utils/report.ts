/**
 * A heavily simplified version of Yarn's StreamReport found at
 * https://github.com/yarnpkg/berry/blob/14027c/packages/yarnpkg-core/sources/StreamReport.ts
 *
 * Copyright (c) 2016-present, Yarn Contributors. All rights reserved.
 * Licensed under the BSD 2-Clause License, https://github.com/yarnpkg/berry/blob/14027c/LICENSE.md
 */

import sliceAnsi from '@arcanis/slice-ansi';
import type {JsonValue} from '@snuggery/core';
import {gray, red, white, yellow} from 'kleur';
import type {Writable} from 'stream';
import stripAnsi from 'strip-ansi';
import type {WriteStream} from 'tty';

export type ReportOptions = {
	enableColors: boolean;
	stdout: Writable;
	json?: boolean;
	verbose?: boolean;
};

export class Report {
	private readonly json: boolean;

	private readonly stdout: Writable;

	private readonly isTty: boolean;

	private readonly enableColors: boolean;

	private readonly isVerbose: boolean;

	constructor({
		enableColors,
		stdout,
		json = false,
		verbose = false,
	}: ReportOptions) {
		this.json = json;
		this.stdout = stdout;
		this.isTty = (stdout as WriteStream).isTTY ?? false;
		this.enableColors = enableColors;
		this.isVerbose = verbose;
	}

	reportSeparator(): void {
		this.writeLine(``);
	}

	reportDebug(text: string): void {
		if (!this.isVerbose) {
			return;
		}

		if (!this.json) {
			this.writeLine(text, {color: gray});
		} else {
			this.reportJson({
				type: `debug`,
				data: text,
			});
		}
	}

	reportInfo(text: string): void {
		if (!this.json) {
			this.writeLine(text, {
				color: white,
			});
		} else {
			this.reportJson({
				type: `info`,
				data: text,
			});
		}
	}

	reportWarning(text: string): void {
		if (!this.json) {
			this.writeLine(text, {
				color: yellow,
			});
		} else {
			this.reportJson({
				type: `warning`,
				data: text,
			});
		}
	}

	reportError(text: string): void {
		if (!this.json) {
			this.writeLine(text, {
				truncate: false,
				color: red,
			});
		} else {
			this.reportJson({
				type: `error`,
				data: text,
			});
		}
	}

	reportJson(data: JsonValue): void {
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
		const doColor = this.enableColors ? color : stripAnsi;

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
