import expect from 'expect';
import {readFile, rm} from 'fs/promises';
import {join} from 'path';
import {suite} from 'uvu';

import {inFixture} from './setup';

const test = suite('schematic resolution');

test(
	'it runs when fully qualified',
	inFixture('multiple-projects', async ({run, directory}) => {
		await rm(join(directory, 'projects/one/lorem'), {force: true});

		await expect(
			run(['run', 'schematic', 'test-schematics:lorem'], {
				cwd: 'projects/one',
			}),
		).resolves.toMatchObject({
			exitCode: 0,
		});

		await expect(
			readFile(join(directory, 'projects/one/lorem'), 'utf-8'),
		).resolves.toBe('File created by schematic test-schematics:lorem');
	}),
);

test(
	'it runs when configured in schematicCollections',
	inFixture('multiple-projects', async ({run, directory}) => {
		await rm(join(directory, 'projects/two/lorem'), {force: true});
		await rm(join(directory, 'projects/two/amet'), {force: true});
		await rm(join(directory, 'projects/two/dolor'), {force: true});

		await expect(
			run(['run', 'schematic', 'lorem'], {
				cwd: 'projects/two',
			}),
		).resolves.toMatchObject({
			exitCode: 0,
		});
		await expect(
			run(['run', 'schematic', 'amet'], {
				cwd: 'projects/two',
			}),
		).resolves.toMatchObject({
			exitCode: 0,
		});

		await expect(
			readFile(join(directory, 'projects/two/lorem'), 'utf-8'),
		).resolves.toBe('File created by schematic test-schematics:lorem');
		await expect(
			readFile(join(directory, 'projects/two/amet'), 'utf-8'),
		).resolves.toBe('File created by schematic test-other-schematics:amet');

		// Schematic defined in both schematic packages

		await expect(
			run(['run', 'schematic', 'dolor'], {
				cwd: 'projects/two',
			}),
		).resolves.toMatchObject({
			exitCode: 0,
		});

		await expect(
			readFile(join(directory, 'projects/two/dolor'), 'utf-8'),
		).resolves.toBe('File created by schematic test-schematics:dolor');
	}),
);

test.run();
