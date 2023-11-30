/* cspell:ignore merol muspi rolod */

import {tags} from '@angular-devkit/core';
import assert from 'node:assert/strict';
import {spawn, SpawnOptionsWithoutStdio} from 'node:child_process';
import {mkdtempSync} from 'node:fs';
import {mkdir, readFile, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {env, execPath} from 'node:process';
import type {Readable} from 'node:stream';
import {suite} from 'uvu';

function exec(
	cmd: [string, ...string[]],
	options?: Partial<SpawnOptionsWithoutStdio>,
) {
	return new Promise<{stdout: string; stderr: string}>((resolve, reject) => {
		const child = spawn(cmd[0], cmd.slice(1), {
			cwd: root,
			stdio: ['ignore', 'pipe', 'pipe'],

			...options,
		});

		const stdout = collect(child.stdout!);
		const stderr = collect(child.stderr!);

		child.addListener('error', reject);

		child.addListener('exit', (code, signal) => {
			if (signal) {
				stderr.then((msg) => console.error(msg));
				reject(new Error(`Command exited with signal ${signal}`));
			} else if (code) {
				stderr.then((msg) => console.error(msg));
				reject(new Error(`Command exited with code ${code}`));
			} else {
				Promise.all([stdout, stderr]).then(([stdout, stderr]) =>
					resolve({stdout, stderr}),
				);
			}
		});
	});

	function collect(stream: Readable) {
		return new Promise<string>((resolve) => {
			const chunks: Buffer[] = [];
			stream.addListener('data', (chunk) => chunks.push(chunk));

			stream.addListener('end', () =>
				resolve(Buffer.concat(chunks).toString('utf-8').trim()),
			);
		});
	}
}

const test = suite('journey');
const root = mkdtempSync(join(tmpdir(), 'snuggery-test'));

test.before(async () => {
	await mkdir(root, {recursive: true});
});

test.after(async () => {
	await rm(root, {force: true, recursive: true});
});

const journey = require.resolve('@snuggery/journey/bin');

test('migration journey', async () => {
	await writeFile(
		join(root, 'main.ts'),
		tags.stripIndent`
			import {lorem, ipsum, dolor} from '@integration/test';
		`,
	);

	const {stderr, stdout} = await exec(
		[
			execPath,
			journey,
			'--from',
			'2.0.0',
			'--to',
			'3.0.0',
			require.resolve('test-schematics/journey.json'),
		],
		{
			env: {...env, NO_COLOR: '1'},
		},
	);

	assert.equal(stderr, '');
	assert.equal(
		stdout,
		[
			`Executing ${require.resolve('test-schematics/journey.json')} journey`,
			'',
			'** Rename export `dolor` from mock package `@integration/test`.',
			'1 file has changed',
			'',
			'🏁 Finished!',
		].join('\n'),
	);

	assert.equal(
		(await readFile(join(root, 'main.ts'), 'utf-8')).trim(),
		tags.stripIndent`
			import { lorem, ipsum, rolod } from "@integration/test";
		`,
	);
});

test('partial migration journey', async () => {
	await writeFile(
		join(root, 'main.ts'),
		tags.stripIndent`
			import {lorem, ipsum, dolor} from '@integration/test';
		`,
	);

	{
		const {stderr, stdout} = await exec(
			[
				execPath,
				journey,
				'--partial',
				'--from',
				'2.0.0',
				'--to',
				'3.0.0',
				require.resolve('test-schematics/journey.json'),
			],
			{
				cwd: root,
				env: {...env, JOURNEY_INJECT: '[[]]', NO_COLOR: '1'},
			},
		);

		assert.equal(stderr, 'Nothing to do');
		assert.equal(stdout, '');

		assert.equal(
			(await readFile(join(root, 'main.ts'), 'utf-8')).trim(),
			tags.stripIndent`
			import {lorem, ipsum, dolor} from '@integration/test';
		`,
		);
	}

	{
		const {stderr, stdout} = await exec(
			[
				execPath,
				journey,
				'--partial',
				'--from',
				'2.0.0',
				'--to',
				'3.0.0',
				require.resolve('test-schematics/journey.json'),
			],
			{
				cwd: root,
				env: {...env, JOURNEY_INJECT: '[["rename-dolor"]]', NO_COLOR: '1'},
			},
		);

		assert.equal(stderr, '');
		assert.equal(
			stdout,
			[
				`Executing ${require.resolve('test-schematics/journey.json')} journey`,
				'',
				'** Rename export `dolor` from mock package `@integration/test`.',
				'1 file has changed',
				'',
				'🏁 Finished!',
			].join('\n'),
		);

		assert.equal(
			(await readFile(join(root, 'main.ts'), 'utf-8')).trim(),
			tags.stripIndent`
			import { lorem, ipsum, rolod } from "@integration/test";
		`,
		);
	}
});

test('non-migration journey', async () => {
	await writeFile(
		join(root, 'main.ts'),
		tags.stripIndent`
			import {lorem, ipsum, dolor} from '@integration/test';
		`,
	);

	{
		const {stderr, stdout} = await exec(
			[execPath, journey, require.resolve('test-schematics/journey.json')],
			{
				cwd: root,
				env: {...env, JOURNEY_INJECT: '[[]]', NO_COLOR: '1'},
			},
		);

		assert.equal(stderr, 'Nothing to do');
		assert.equal(stdout, '');

		assert.equal(
			(await readFile(join(root, 'main.ts'), 'utf-8')).trim(),
			tags.stripIndent`
			import {lorem, ipsum, dolor} from '@integration/test';
		`,
		);
	}

	{
		const {stderr, stdout} = await exec(
			[execPath, journey, require.resolve('test-schematics/journey.json')],
			{
				cwd: root,
				env: {
					...env,
					JOURNEY_INJECT: '[["rename-lorem"]]',
					NO_COLOR: '1',
				},
			},
		);

		assert.equal(stderr, '');
		assert.equal(
			stdout,
			[
				`Executing ${require.resolve('test-schematics/journey.json')} journey`,
				'',
				'** Rename export `lorem` from mock package `@integration/test`.',
				'1 file has changed',
				'',
				'🏁 Finished!',
			].join('\n'),
		);

		assert.equal(
			(await readFile(join(root, 'main.ts'), 'utf-8')).trim(),
			tags.stripIndent`
			import { merol, ipsum, dolor } from "@integration/test";
		`,
		);
	}

	{
		const {stderr, stdout} = await exec(
			[execPath, journey, require.resolve('test-schematics/journey.json')],
			{
				cwd: root,
				env: {
					...env,
					JOURNEY_INJECT: '[["rename-ipsum", "rename-lorem"]]',
					NO_COLOR: '1',
				},
			},
		);

		assert.equal(stderr, '');
		assert.equal(
			stdout,
			[
				`Executing ${require.resolve('test-schematics/journey.json')} journey`,
				'',
				'** Rename export `ipsum` from mock package `@integration/test`.',
				'1 file has changed',
				'',
				'** Rename export `lorem` from mock package `@integration/test`.',
				// nothing to do because the replace-lorem journey is already executed
				'Nothing has changed',
				'',
				'🏁 Finished!',
			].join('\n'),
		);

		assert.equal(
			(await readFile(join(root, 'main.ts'), 'utf-8')).trim(),
			tags.stripIndent`
			import { merol, muspi, dolor } from "@integration/test";
		`,
		);
	}
});

test.run();
