/* eslint-disable @typescript-eslint/no-explicit-any */
import assert from 'node:assert/strict';
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
		assert.deepEqual(await parse(JSON.stringify(obj)), obj);
	}
});

test('reading should fail on non-objects', async () => {
	for (const nonObj of [true, null, 42, 'not an object']) {
		assert.rejects(
			parse(JSON.stringify(nonObj)),
			'Configuration must be an object',
		);
	}
});

test('reading should fail on invalid JSON', async () => {
	for (const invalid of ['lorem: 2', '{', '[', '{"lorem": }']) {
		await assert.rejects(parse(invalid), /Errors? while parsing JSON file/);
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
		assert.deepEqual(await write(obj), obj);
	}
});

test('updating should support adding properties', async () => {
	assert.deepEqual(
		await update({}, obj => {
			obj.foo = 2;
		}),
		{foo: 2},
	);

	assert.deepEqual(
		await update({lorem: {ipsum: {}}}, (obj: any) => {
			obj.lorem.ipsum.dolor = {sit: 'amet'};
		}),
		{
			lorem: {ipsum: {dolor: {sit: 'amet'}}},
		},
	);
});

test('updating should support removing properties', async () => {
	assert.deepEqual(
		await update({foo: 2, bar: 4}, obj => {
			delete obj.foo;
		}),
		{bar: 4},
	);

	assert.deepEqual(
		await update({lorem: {ipsum: {dolor: {sit: 'amet'}}}}, (obj: any) => {
			delete obj.lorem.ipsum.dolor;
		}),
		{
			lorem: {ipsum: {}},
		},
	);
});

test('updating should support removing properties by setting to undefined', async () => {
	assert.deepEqual(
		await update({foo: 2, bar: 4}, (obj: any) => {
			obj.foo = undefined;
		}),
		{bar: 4},
	);

	assert.deepEqual(
		await update({lorem: {ipsum: {dolor: {sit: 'amet'}}}}, (obj: any) => {
			obj.lorem.ipsum.dolor = undefined;
		}),
		{
			lorem: {ipsum: {}},
		},
	);
});

test('updating should support modifying properties', async () => {
	assert.deepEqual(
		await update({foo: 2, bar: 4}, (obj: any) => {
			obj.foo = 6;
		}),
		{foo: 6, bar: 4},
	);

	assert.deepEqual(
		await update({lorem: {ipsum: {dolor: {sit: 'amet'}}}}, (obj: any) => {
			obj.lorem.ipsum.dolor = 42;
		}),
		{
			lorem: {ipsum: {dolor: 42}},
		},
	);
});

test('updating should support multiple changes', async () => {
	assert.deepEqual(
		await update(
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
		{
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
		},
	);
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
