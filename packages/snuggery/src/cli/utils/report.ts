/**
 * A heavily simplified version of Yarn's StreamReport found at
 * https://github.com/yarnpkg/berry/blob/14027c/packages/yarnpkg-core/sources/StreamReport.ts
 *
 * Copyright (c) 2016-present, Yarn Contributors. All rights reserved.
 * Licensed under the BSD 2-Clause License, https://github.com/yarnpkg/berry/blob/14027c/LICENSE.md
 */

import sliceAnsi from "@arcanis/slice-ansi";
import type {JsonValue} from "@snuggery/core";
import {gray, white, yellow, red} from "kleur/colors";
import type {Writable} from "node:stream";
import type {WriteStream} from "node:tty";
import stripAnsi from "strip-ansi";

export type ReportOptions = {
	enableColors: boolean;
	stdout: Writable;
	json?: boolean;
	verbose?: boolean;
};

class BaseReport {
	readonly #json: boolean;

	readonly #stdout: Writable;

	readonly #isTty: boolean;

	readonly #enableColors: boolean;

	readonly #isVerbose: boolean;

	constructor({
		enableColors,
		stdout,
		json = false,
		verbose = false,
	}: ReportOptions) {
		this.#json = json;
		this.#stdout = stdout;
		this.#isTty = (stdout as WriteStream).isTTY ?? false;
		this.#enableColors = enableColors;
		this.#isVerbose = verbose;
	}

	reportSeparator(): void {
		this.#writeLine(``);
	}

	reportDebug(text: string): void {
		if (!this.#isVerbose) {
			return;
		}

		if (!this.#json) {
			this.#writeLine(text, {color: gray});
		} else {
			this.reportJson({
				type: `debug`,
				data: text,
			});
		}
	}

	reportInfo(text: string): void {
		if (!this.#json) {
			this.#writeLine(text, {
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
		if (!this.#json) {
			this.#writeLine(text, {
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
		if (!this.#json) {
			this.#writeLine(text, {
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
		if (this.#json) {
			this.#writeLine(JSON.stringify(data));
		}
	}

	#writeLine(
		str: string,
		{
			truncate,
			color = (value) => value,
		}: {truncate?: boolean; color?: (text: string) => string} = {},
	) {
		const doColor = this.#enableColors ? color : stripAnsi;

		this.#stdout.write(`${doColor(this.#truncate(str, {truncate}))}\n`);
	}

	#truncate(str: string, {truncate}: {truncate?: boolean} = {}) {
		if (!this.#isTty) truncate = false;

		// The -1 is to account for terminals that would wrap after
		// the last column rather before the first overwrite
		if (truncate)
			str = sliceAnsi(str, 0, (this.#stdout as WriteStream).columns - 1).slice;

		return str;
	}
}

export class Report {
	readonly #base: Report | BaseReport;

	#numberOfWarnings = 0;

	#numberOfErrors = 0;

	constructor({enableColors, stdout, json, verbose}: ReportOptions);
	constructor(base: Report | BaseReport);
	constructor(optsOrBase: ReportOptions | Report | BaseReport) {
		if ("reportWarning" in optsOrBase) {
			this.#base = optsOrBase;
		} else {
			this.#base = new BaseReport(optsOrBase);
		}
	}

	get numberOfWarnings(): number {
		return this.#numberOfWarnings;
	}

	get numberOfErrors(): number {
		return this.#numberOfErrors;
	}

	reportSeparator(): void {
		this.#base.reportSeparator();
	}

	reportDebug(text: string): void {
		this.#base.reportDebug(text);
	}

	reportInfo(text: string): void {
		this.#base.reportInfo(text);
	}

	reportWarning(text: string): void {
		this.#numberOfWarnings++;

		this.#base.reportWarning(text);
	}

	reportError(text: string): void {
		this.#numberOfErrors++;

		this.#base.reportError(text);
	}

	reportJson(data: JsonValue): void {
		this.#base.reportJson(data);
	}

	createSubReport(): Report {
		return new Report(this);
	}
}
