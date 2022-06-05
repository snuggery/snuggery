/* cspell:ignore fesm rebeccapurple */

import expect from 'expect';
import {readFile, stat} from 'fs/promises';
import {join} from 'path';
import {suite} from 'uvu';

import {inFixture} from './setup';

const test = suite('angular');

test(
	'the standalone project',
	inFixture('angular', async ({expectSuccessfulRun, directory}) => {
		await expectSuccessfulRun(['build', '@integration/standalone']);

		const outputFolder = join(directory, 'packages/standalone/dist');
		const packageJson = JSON.parse(
			await readFile(join(outputFolder, 'package.json'), 'utf8'),
		);
		const fesm = await readFile(
			join(outputFolder, 'fesm2020/standalone.js'),
			'utf8',
		);

		// Expect exports to be defined correctly
		expect(packageJson.exports['.']).toMatchObject({
			types: './index.d.ts',
			esm2020: './esm2020/standalone.js',
			es2020: './fesm2020/standalone.js',
			es2015: './fesm2015/standalone.js',
			node: './fesm2015/standalone.js',
			default: './fesm2020/standalone.js',
		});
		expect(packageJson.exports['./sub']).toMatchObject({
			types: './sub/index.d.ts',
			esm2020: './sub/esm2020/sub.js',
			es2020: './fesm2020/sub.js',
			es2015: './fesm2015/sub.js',
			node: './fesm2015/sub.js',
			default: './fesm2020/sub.js',
		});

		expect(packageJson.sideEffects).toBe(false);

		// expect the module and component to be defined
		expect(fesm).toContain('MyComponent');
		expect(fesm).toContain('StandaloneModule');

		// expect the scss to be compiled
		expect(fesm).not.toContain('@use');
		expect(fesm).toMatch(/rebeccapurple|#639/);

		// expect tslib to have been removed
		await expect(
			readFile(join(outputFolder, 'package.json'), 'utf8'),
		).resolves.not.toContain('tslib');

		// Expect the .d.ts files not to be flattened
		const subDts = await readFile(
			join(outputFolder, 'sub', 'index.d.ts'),
			'utf8',
		);
		expect(subDts).not.toContain('export declare class SubModule');
		expect(subDts).toContain("export * from './types/sub.js';");
		expect(stat(join(outputFolder, 'sub', 'types'))).resolves.toBeTruthy();

		await expectSuccessfulRun([
			'build',
			'@integration/standalone',
			'--configuration',
			'enable-api-extractor',
		]);

		// Expect the .d.ts files to be flattened
		await expect(
			readFile(join(outputFolder, 'sub', 'index.d.ts'), 'utf8'),
		).resolves.toContain('export declare class SubModule');
		expect(stat(join(outputFolder, 'sub', 'types'))).rejects.toThrowError(
			/no such file or directory/,
		);
	}),
);

test(
	'the dependent project',
	inFixture('angular', async ({expectSuccessfulRun, directory}) => {
		await expectSuccessfulRun(['build', '@integration/dependent']);

		const outputFolder = join(directory, 'packages/dependent/dist');
		const [component, fesm] = await Promise.all([
			readFile(join(outputFolder, 'esm2020/other.component.js'), 'utf-8'),
			readFile(join(outputFolder, 'fesm2020/dependent.js'), 'utf8'),
		]);

		// expect the compiler to have inserted valid imports
		expect(component).toContain(
			'import * as i1 from "@integration/standalone";',
		);

		// expect the module and component to be defined
		expect(fesm).toContain('OtherComponent');
		expect(fesm).toContain('DependentModule');

		// expect the scss to be compiled
		expect(fesm).not.toContain('@use');
		expect(fesm).toMatch(/rebeccapurple|#639/);
	}),
);

test.run();
