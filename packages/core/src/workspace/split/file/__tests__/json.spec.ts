/* eslint-disable @typescript-eslint/no-explicit-any */
import expect from 'expect';
import {suite} from 'uvu';

import {createTextFileHandle} from '../../../file';
import type {JsonObject} from '../../../types';
import {createFileHandle} from '../../file';

import {TestSingleFileWorkspaceHost} from './utils';

const test = suite('JsonFileHandle');

test('reading should parse valid json objects', async () => {
	for (const obj of [
		{},
		{foo: 2},
		{
			lorem: 'ipsum',
			dolor: ['sit', 'amet', ['the', 'quick', {brown: 'fox'}, 'jumps']],
		},
	]) {
		await expect(parse(JSON.stringify(obj))).resolves.toEqual(obj);
	}
});

test('reading should fail on non-objects', async () => {
	for (const nonObj of [true, null, 42, 'not an object']) {
		await expect(parse(JSON.stringify(nonObj))).rejects.toThrowError(
			'Configuration must be an object',
		);
	}
});

test('reading should fail on invalid JSON', async () => {
	for (const invalid of ['lorem: 2', '{', '[', '{"lorem": }']) {
		await expect(parse(invalid)).rejects.toThrowError(
			/Errors? while parsing JSON file/,
		);
	}
});

test('writing should write valid json objects', async () => {
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

async function parse(content: string) {
	const host = new TestSingleFileWorkspaceHost('test.json', content);

	return await createFileHandle(
		await createTextFileHandle(host, 'test.json', ['test.json']),
		'test.json',
	).read();
}

async function write(content: JsonObject) {
	const host = new TestSingleFileWorkspaceHost('test.json', '');

	await createFileHandle(
		await createTextFileHandle(host, 'test.json', ['test.json']),
		'test.json',
	).write(content, {});

	return JSON.parse(host.currentContent);
}

async function update(
	source: JsonObject,
	updater: (value: JsonObject) => void | Promise<void>,
) {
	const host = new TestSingleFileWorkspaceHost(
		'test.json',
		JSON.stringify(source),
	);

	await createFileHandle(
		await createTextFileHandle(host, 'test.json', ['test.json']),
		'test.json',
	).update(updater);

	return JSON.parse(host.currentContent);
}

test.run();
