import expect from 'expect';
import {suite} from 'uvu';

import {inFixture} from './setup';

const test = suite('builder resolution');

test(
	'it runs builder via package',
	inFixture('builders', async ({runJson}) => {
		await expect(
			runJson(['run', 'target', 'fixture:installed-builder']),
		).resolves.toMatchObject({
			withDefault: 'defaultValue',
		});
	}),
);

test(
	'it runs builder via package with arguments',
	inFixture('builders', async ({runJson}) => {
		await expect(
			runJson([
				'run',
				'target',
				'fixture:installed-builder',
				'--foo',
				'bar',
				'--with-default',
				'baz',
			]),
		).resolves.toMatchObject({
			foo: 'bar',
			withDefault: 'baz',
		});
	}),
);

test(
	'it runs builder via local builders.json',
	inFixture('builders', async ({runJson}) => {
		await expect(
			runJson(['run', 'target', 'fixture:local-builder']),
		).resolves.toMatchObject({
			withDefault: 'defaultValue',
		});
	}),
);

test(
	'it runs builder via local builders.json with arguments',
	inFixture('builders', async ({runJson}) => {
		await expect(
			runJson([
				'run',
				'target',
				'fixture:local-builder',
				'--foo',
				'bar',
				'--with-default',
				'baz',
			]),
		).resolves.toMatchObject({
			foo: 'bar',
			withDefault: 'baz',
		});
	}),
);

test(
	'it runs builder via local builder.json',
	inFixture('builders', async ({runJson}) => {
		await expect(
			runJson(['run', 'target', 'fixture:local-builder-single']),
		).resolves.toMatchObject({
			withDefault: 'defaultValue',
		});
	}),
);

test(
	'it runs builder via local builder.json with arguments',
	inFixture('builders', async ({runJson}) => {
		await expect(
			runJson([
				'run',
				'target',
				'fixture:local-builder-single',
				'--foo',
				'bar',
				'--with-default',
				'baz',
			]),
		).resolves.toMatchObject({
			foo: 'bar',
			withDefault: 'baz',
		});
	}),
);

test(
	'it runs builder via implementation',
	inFixture('builders', async ({runJson}) => {
		await expect(
			runJson(['run', 'target', 'fixture:local-builder-implementation']),
		).resolves.toMatchObject({});
	}),
);

test(
	'it runs builder via implementation with arguments',
	inFixture('builders', async ({runJson}) => {
		await expect(
			runJson([
				'run',
				'target',
				'fixture:local-builder-implementation',
				'--foo',
				'bar',
				'--with-default',
				'baz',
			]),
		).resolves.toMatchObject({
			foo: 'bar',
			withDefault: 'baz',
		});
	}),
);

test(
	'it runs builder via schema',
	inFixture('builders', async ({runJson}) => {
		await expect(
			runJson(['run', 'target', 'fixture:local-builder-schema']),
		).resolves.toMatchObject({
			withDefault: 'defaultValue',
		});
	}),
);

test(
	'it runs builder via schema with arguments',
	inFixture('builders', async ({runJson}) => {
		await expect(
			runJson([
				'run',
				'target',
				'fixture:local-builder-schema',
				'--foo',
				'bar',
				'--with-default',
				'baz',
			]),
		).resolves.toMatchObject({
			foo: 'bar',
			withDefault: 'baz',
		});
	}),
);

test.run();
