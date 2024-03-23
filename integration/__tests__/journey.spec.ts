/* cspell:ignore merol muspi rolod */

import {tags} from "@angular-devkit/core";
import assert from "node:assert/strict";
import {mkdtempSync} from "node:fs";
import {mkdir, readFile, rm, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {Readable} from "node:stream";
import stripAnsi from "strip-ansi";
import {suite} from "uvu";

import {CollectingWritable} from "./setup";

async function exec(
	args: [string, ...string[]],
	input: ("up" | "down" | "space" | "enter")[] = [],
) {
	input = [...input, "enter"];
	const stdin = new Readable({
		read() {
			switch (input.shift()) {
				case undefined:
					this.push(null);
					break;
				case "down":
					this.push("\x1b[B");
					break;
				case "up":
					this.push("\x1b[A");
					break;
				case "space":
					this.push(" ");
					break;
				case "enter":
					this.push("\n");
					stderr.reset();
					break;
				default:
					throw new Error("erh");
			}
		},
	});
	const stdout = new CollectingWritable();
	const stderr = new CollectingWritable();

	// @ts-expect-error we didn't provide types
	const {run} = await import("@snuggery/journey/test-cli");

	const result = await run({
		args,
		stdin,
		stdout,
		stderr,
		cwd: root,
	});

	assert(!result);

	return {
		stdout: stripAnsi(stdout.getContent().toString()).trim(),
		stderr: stripAnsi(stderr.getContent().toString())
			.trim()
			.replace(/^.*✔/s, "✔"),
	};
}

const test = suite("journey");
const root = mkdtempSync(join(tmpdir(), "snuggery-test"));

test.before(async () => {
	await mkdir(root, {recursive: true});
});

test.after(async () => {
	await rm(root, {force: true, recursive: true});
});

test("migration journey", async () => {
	await writeFile(
		join(root, "main.ts"),
		tags.stripIndent`
			import {lorem, ipsum, dolor} from '@integration/test';
		`,
	);

	const {stderr, stdout} = await exec([
		"--from",
		"2.0.0",
		"--to",
		"3.0.0",
		require.resolve("test-schematics/journey.json"),
	]);

	assert.equal(stderr, "");
	assert.equal(
		stdout,
		[
			`Executing ${require.resolve("test-schematics/journey.json")} journey`,
			"",
			"** Rename export `dolor` from mock package `@integration/test`.",
			"1 file has changed",
			"",
			"🏁 Finished!",
		].join("\n"),
	);

	assert.equal(
		(await readFile(join(root, "main.ts"), "utf-8")).trim(),
		tags.stripIndent`
			import { lorem, ipsum, rolod } from "@integration/test";
		`,
	);
});

test("partial migration journey", async () => {
	await writeFile(
		join(root, "main.ts"),
		tags.stripIndent`
			import {lorem, ipsum, dolor} from '@integration/test';
		`,
	);

	{
		const {stderr, stdout} = await exec([
			"--partial",
			"--from",
			"2.0.0",
			"--to",
			"3.0.0",
			require.resolve("test-schematics/journey.json"),
		]);

		assert.equal(
			stderr,
			["✔ Select optional journeys to run › ", "Nothing to do"].join("\n"),
		);
		assert.equal(stdout, "");

		assert.equal(
			(await readFile(join(root, "main.ts"), "utf-8")).trim(),
			tags.stripIndent`
				import {lorem, ipsum, dolor} from '@integration/test';
			`,
		);
	}

	{
		const {stderr, stdout} = await exec(
			[
				"--partial",
				"--from",
				"2.0.0",
				"--to",
				"3.0.0",
				require.resolve("test-schematics/journey.json"),
			],
			["space"],
		);

		assert.equal(
			stderr,
			"✔ Select optional journeys to run › Rename export `dolor` from mock package `@integration/test`.",
		);
		assert.equal(
			stdout,
			[
				`Executing ${require.resolve("test-schematics/journey.json")} journey`,
				"",
				"** Rename export `dolor` from mock package `@integration/test`.",
				"1 file has changed",
				"",
				"🏁 Finished!",
			].join("\n"),
		);

		assert.equal(
			(await readFile(join(root, "main.ts"), "utf-8")).trim(),
			tags.stripIndent`
				import { lorem, ipsum, rolod } from "@integration/test";
			`,
		);
	}
});

test("non-migration journey", async () => {
	await writeFile(
		join(root, "main.ts"),
		tags.stripIndent`
			import {lorem, ipsum, dolor} from '@integration/test';
		`,
	);

	{
		const {stderr} = await exec([
			require.resolve("test-schematics/journey.json"),
		]);

		assert.equal(
			stderr,
			["✔ Select optional journeys to run › ", "Nothing to do"].join("\n"),
		);

		assert.equal(
			(await readFile(join(root, "main.ts"), "utf-8")).trim(),
			tags.stripIndent`
				import {lorem, ipsum, dolor} from '@integration/test';
			`,
		);
	}

	{
		const {stdout, stderr} = await exec(
			[require.resolve("test-schematics/journey.json")],
			["down", "space"],
		);

		assert.equal(
			stderr,
			"✔ Select optional journeys to run › Rename export `lorem` from mock package `@integration/test`.",
		);
		assert.equal(
			stdout,
			[
				`Executing ${require.resolve("test-schematics/journey.json")} journey`,
				"",
				"** Rename export `lorem` from mock package `@integration/test`.",
				"1 file has changed",
				"",
				"🏁 Finished!",
			].join("\n"),
		);

		assert.equal(
			(await readFile(join(root, "main.ts"), "utf-8")).trim(),
			tags.stripIndent`
				import { merol, ipsum, dolor } from "@integration/test";
			`,
		);
	}

	{
		const {stdout} = await exec(
			[require.resolve("test-schematics/journey.json")],
			["down", "space", "down", "space"],
		);

		assert.equal(
			stdout,
			[
				`Executing ${require.resolve("test-schematics/journey.json")} journey`,
				"",
				"** Rename export `ipsum` from mock package `@integration/test`.",
				"1 file has changed",
				"",
				"** Rename export `lorem` from mock package `@integration/test`.",
				// nothing to do because the replace-lorem journey is already executed
				"Nothing has changed",
				"",
				"🏁 Finished!",
			].join("\n"),
		);

		assert.equal(
			(await readFile(join(root, "main.ts"), "utf-8")).trim(),
			tags.stripIndent`
				import { merol, muspi, dolor } from "@integration/test";
			`,
		);
	}
});

test.run();
