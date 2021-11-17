/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-empty-function */

import {tags} from '@angular-devkit/core';
import expect from 'expect';
import {suite} from 'uvu';
import * as YAML from 'yaml';

import {createFileHandle} from '../../file';
import type {JsonObject} from '../../types';

import {TestSingleFileWorkspaceHost} from './utils';

const test = suite('YamlFileHandle');

function stripIndent(strings: TemplateStringsArray) {
	return tags.stripIndent(strings).replace(/\t/g, '  ').trim() + '\n';
}

test('reading objects should work', async () => {
	for (const obj of [
		{},
		{foo: 2},
		{
			lorem: 'ipsum',
			dolor: ['sit', 'amet', ['the', 'quick', {brown: 'fox'}, 'jumps']],
		},
	]) {
		await expect(parse(YAML.stringify(obj))).resolves.toEqual(obj);
	}
});

test('reading non-objects should fail', async () => {
	for (const nonObj of [true, null, 42, 'not an object']) {
		await expect(parse(YAML.stringify(nonObj))).rejects.toThrowError(
			'Configuration must be an object',
		);
	}
});

test('writing', async () => {
	for (const obj of [
		{},
		{foo: 2},
		{
			lorem: 'ipsum',
			dolor: ['sit', 'amet', ['the', 'quick', {brown: 'fox'}, 'jumps']],
		},
	] as JsonObject[]) {
		await expect(write(obj)).resolves.toEqual(obj);
	}
});

test('updating without changes', async () => {
	await expect(update({}, () => {})).resolves.toEqual({});

	await expect(update({lorem: {ipsum: {}}}, () => {})).resolves.toEqual({
		lorem: {ipsum: {}},
	});
});

test('updating should support adding properties', async () => {
	await expect(
		update({}, obj => {
			obj.foo = 2;
		}),
	).resolves.toEqual({foo: 2});

	await expect(
		update({lorem: {ipsum: {}}}, (obj: any) => {
			obj.lorem.ipsum.dolor = {sit: 'amet'};
		}),
	).resolves.toEqual({
		lorem: {ipsum: {dolor: {sit: 'amet'}}},
	});
});

test('updating should support removing properties', async () => {
	await expect(
		update({foo: 2, bar: 4}, obj => {
			delete obj.foo;
		}),
	).resolves.toEqual({bar: 4});

	await expect(
		update({lorem: {ipsum: {dolor: {sit: 'amet'}}}}, (obj: any) => {
			delete obj.lorem.ipsum.dolor;
		}),
	).resolves.toEqual({
		lorem: {ipsum: {}},
	});
});

test('updating should support removing properties by setting to undefined', async () => {
	await expect(
		update({foo: 2, bar: 4}, (obj: any) => {
			obj.foo = undefined;
		}),
	).resolves.toEqual({bar: 4});

	await expect(
		update({lorem: {ipsum: {dolor: {sit: 'amet'}}}}, (obj: any) => {
			obj.lorem.ipsum.dolor = undefined;
		}),
	).resolves.toEqual({
		lorem: {ipsum: {}},
	});
});

test('updating should support modifying properties', async () => {
	await expect(
		update({foo: 2, bar: 4}, (obj: any) => {
			obj.foo = 6;
		}),
	).resolves.toEqual({foo: 6, bar: 4});

	await expect(
		update({lorem: {ipsum: {dolor: {sit: 'amet'}}}}, (obj: any) => {
			obj.lorem.ipsum.dolor = 42;
		}),
	).resolves.toEqual({
		lorem: {ipsum: {dolor: 42}},
	});
});

test('updating should support multiple changes', async () => {
	await expect(
		update(
			{
				lorem: {ipsum: {dolor: {sit: 'amet'}}},
				foxy: ['the', 'quick', 'brown', 'fox', 'jumps'],
			},
			(obj: any) => {
				obj.lorem.ipsum.dolor.loremIpsum = true;
				obj.lorem.ipsum.loremIpsum = true;
				obj.lorem.loremIpsum = true;

				delete obj.lorem.ipsum.dolor.sit;

				obj.foxy[1] = 'lazy';
			},
		),
	).resolves.toEqual({
		lorem: {
			ipsum: {
				dolor: {
					loremIpsum: true,
				},
				loremIpsum: true,
			},
			loremIpsum: true,
		},
		foxy: ['the', 'lazy', 'brown', 'fox', 'jumps'],
	});
});

test('updating should transform aliases into merges', async () => {
	await expect(
		updateString(
			stripIndent`
				lorem:
					&ipsum { dolor: true }
				foo:
					bar: *ipsum
			`,
			(object: any) => {
				object.foo.bar.added = true;
				object.foo.bar.addedToo = true;
			},
		),
	).resolves.toEqual(
		stripIndent`
			lorem:
				&ipsum { dolor: true }
			foo:
				bar:
					<<: *ipsum
					added: true
					addedToo: true
		`,
	);

	await expect(
		updateString(
			stripIndent`
				lorem:
					&ipsum { dolor: true }
				foo:
					bar: *ipsum
			`,
			(object: any) => {
				object.foo.bar = 'changed';
			},
		),
	).resolves.toEqual(
		stripIndent`
			lorem:
				&ipsum { dolor: true }
			foo:
				bar: changed
		`,
	);

	await expect(
		updateString(
			stripIndent`
				lorem:
					&ipsum { dolor: true }
				foo:
					bar: *ipsum
			`,
			(object: any) => {
				object.foo.bar.dolor = 'changed';
			},
		),
	).resolves.toEqual(
		stripIndent`
			lorem:
				&ipsum { dolor: true }
			foo:
				bar:
					<<: *ipsum
					dolor: changed
		`,
	);

	await expect(
		updateString(
			stripIndent`
				lorem:
					&ipsum { dolor: true }
				foo:
					bar: *ipsum
			`,
			(object: any) => {
				delete object.foo.bar.dolor;
			},
		),
	).resolves.toEqual(
		stripIndent`
			lorem:
				&ipsum { dolor: true }
			foo:
				bar:
					<<: *ipsum
					dolor: null
		`,
	);

	await expect(
		updateString(
			stripIndent`
				lorem:
					&ipsum
					dolor:
						&amet { sit: true }
					quux: *amet
				foo:
					bar: *ipsum
			`,
			(object: any) => {
				object.foo.bar.quux.sit = false;
			},
		),
	).resolves.toEqual(
		stripIndent`
			lorem:
				&ipsum
				dolor:
					&amet { sit: true }
				quux: *amet
			foo:
				bar:
					<<: *ipsum
					quux:
						<<: *amet
						sit: false
		`,
	);
});

test('updating should handle changes on merged objects', async () => {
	await expect(
		updateString(
			stripIndent`
				lorem:
					&ipsum
					dolor:
						&amet { sit: true }
					quux: *amet
				foo:
					bar:
						<<: *ipsum
						extra: true
			`,
			(object: any) => {
				delete object.foo.bar.extra;
			},
		),
	).resolves.toEqual(
		stripIndent`
			lorem:
				&ipsum
				dolor:
					&amet { sit: true }
				quux: *amet
			foo:
				bar:
					<<: *ipsum
		`,
	);

	await expect(
		updateString(
			stripIndent`
				lorem:
					&ipsum
					dolor:
						&amet { sit: true }
					quux: *amet
				foo:
					bar:
						<<: *ipsum
			`,
			(object: any) => {
				object.foo.bar.dolor.added = true;
			},
		),
	).resolves.toEqual(
		stripIndent`
			lorem:
				&ipsum
				dolor:
					&amet { sit: true }
				quux: *amet
			foo:
				bar:
					<<: *ipsum
					dolor: { sit: true, added: true }
		`,
	);

	await expect(
		updateString(
			stripIndent`
				lorem:
					&ipsum
					dolor:
						&amet { sit: true }
					quux: *amet
				foo:
					bar:
						<<: *ipsum
			`,
			(object: any) => {
				delete object.foo.bar.quux;
			},
		),
	).resolves.toEqual(
		stripIndent`
			lorem:
				&ipsum
				dolor:
					&amet { sit: true }
				quux: *amet
			foo:
				bar:
					<<: *ipsum
					quux: null
		`,
	);

	await expect(
		updateString(
			stripIndent`
				lorem:
					&ipsum
					dolor:
						&amet { sit: true }
					quux: *amet
				foo:
					bar:
						<<: *ipsum
			`,
			(object: any) => {
				object.foo.bar.quux.sit = false;
			},
		),
	).resolves.toEqual(
		stripIndent`
			lorem:
				&ipsum
				dolor:
					&amet { sit: true }
				quux: *amet
			foo:
				bar:
					<<: *ipsum
					quux:
						<<: *amet
						sit: false
		`,
	);

	await expect(
		updateString(
			stripIndent`
				lorem:
					&ipsum
					dolor:
						&amet { sit: &sit true }
					quux: *amet
				foo:
					bar:
						&bar
						<<: *ipsum
					baz:
						<<: *bar
			`,
			(object: any) => {
				object.foo.baz.dolor.added = true;
			},
		),
	).resolves.toEqual(
		stripIndent`
			lorem:
				&ipsum
				dolor:
					&amet { sit: &sit true }
				quux: *amet
			foo:
				bar:
					&bar
					<<: *ipsum
				baz:
					<<: *bar
					dolor: { sit: *sit, added: true }
		`,
	);
});

async function parse(content: string) {
	const host = new TestSingleFileWorkspaceHost('test.yaml', content);

	return await (
		await createFileHandle(host, 'test.yaml', ['test.yaml'])
	).read();
}

async function write(content: JsonObject) {
	const host = new TestSingleFileWorkspaceHost('test.yaml', '');

	await (
		await createFileHandle(host, 'test.yaml', ['test.yaml'])
	).write(content);

	return YAML.parse(host.currentContent);
}

async function update(
	source: JsonObject,
	updater: (value: JsonObject) => void | Promise<void>,
) {
	const host = new TestSingleFileWorkspaceHost(
		'test.yaml',
		YAML.stringify(source),
	);

	await (
		await createFileHandle(host, 'test.yaml', ['test.yaml'])
	).update(updater);

	return YAML.parse(host.currentContent);
}

async function updateString(
	source: string,
	updater: (value: JsonObject) => void | Promise<void>,
) {
	const host = new TestSingleFileWorkspaceHost('test.yaml', source);

	await (
		await createFileHandle(host, 'test.yaml', ['test.yaml'])
	).update(updater);

	return host.currentContent;
}

test.run();
