/* eslint-disable @typescript-eslint/no-explicit-any */

import {tags} from "@angular-devkit/core";
import assert from "node:assert/strict";
import {suite} from "uvu";
import * as YAML from "yaml";

import {createTextFileHandle} from "../../../file";
import type {JsonObject} from "../../../types";
import {createFileHandle} from "../../file";

import {TestSingleFileWorkspaceHost} from "./utils";

const test = suite("YamlFileHandle");

function stripIndent(strings: TemplateStringsArray) {
	return tags.stripIndent(strings).replace(/\t/g, "  ").trim() + "\n";
}

test("reading objects should work", async () => {
	for (const obj of [
		{},
		{foo: 2},
		{
			lorem: "ipsum",
			dolor: ["sit", "amet", ["the", "quick", {brown: "fox"}, "jumps"]],
		},
	]) {
		assert.deepEqual(await parse(YAML.stringify(obj)), obj);
	}
});

test("reading non-objects should fail", async () => {
	for (const nonObj of [true, null, 42, "not an object"]) {
		await assert.rejects(
			parse(YAML.stringify(nonObj)),
			"Configuration must be an object",
		);
	}
});

test("writing", async () => {
	for (const obj of [
		{},
		{foo: 2},
		{
			lorem: "ipsum",
			dolor: ["sit", "amet", ["the", "quick", {brown: "fox"}, "jumps"]],
		},
	] as JsonObject[]) {
		assert.deepEqual(await write(obj), obj);
	}
});

test("updating without changes", async () => {
	assert.deepEqual(await update({}, () => {}), {});

	assert.deepEqual(await update({lorem: {ipsum: {}}}, () => {}), {
		lorem: {ipsum: {}},
	});
});

test("updating should support adding properties", async () => {
	assert.deepEqual(
		await update({}, (obj) => {
			obj.foo = 2;
		}),
		{foo: 2},
	);

	assert.deepEqual(
		await update({lorem: {ipsum: {}}}, (obj: any) => {
			obj.lorem.ipsum.dolor = {sit: "amet"};
		}),
		{
			lorem: {ipsum: {dolor: {sit: "amet"}}},
		},
	);
});

test("updating should support removing properties", async () => {
	assert.deepEqual(
		await update({foo: 2, bar: 4}, (obj) => {
			delete obj.foo;
		}),
		{bar: 4},
	);

	assert.deepEqual(
		await update({lorem: {ipsum: {dolor: {sit: "amet"}}}}, (obj: any) => {
			delete obj.lorem.ipsum.dolor;
		}),
		{
			lorem: {ipsum: {}},
		},
	);
});

test("updating should support removing properties by setting to undefined", async () => {
	assert.deepEqual(
		await update({foo: 2, bar: 4}, (obj: any) => {
			obj.foo = undefined;
		}),
		{bar: 4},
	);

	assert.deepEqual(
		await update({lorem: {ipsum: {dolor: {sit: "amet"}}}}, (obj: any) => {
			obj.lorem.ipsum.dolor = undefined;
		}),
		{
			lorem: {ipsum: {}},
		},
	);
});

test("updating should support modifying properties", async () => {
	await update({foo: 2, bar: 4}, (obj: any) => {
		obj.foo = 6;
	});
	assert.deepEqual(
		await update({foo: 2, bar: 4}, (obj: any) => {
			obj.foo = 6;
		}),
		{foo: 6, bar: 4},
	);

	assert.deepEqual(
		await update({lorem: {ipsum: {dolor: {sit: "amet"}}}}, (obj: any) => {
			obj.lorem.ipsum.dolor = 42;
		}),
		{
			lorem: {ipsum: {dolor: 42}},
		},
	);
});

test("updating should support multiple changes", async () => {
	assert.deepEqual(
		await update(
			{
				lorem: {ipsum: {dolor: {sit: "amet"}}},
				foxy: ["the", "quick", "brown", "fox", "jumps"],
			},
			(obj: any) => {
				obj.lorem.ipsum.dolor.loremIpsum = true;
				obj.lorem.ipsum.loremIpsum = true;
				obj.lorem.loremIpsum = true;

				delete obj.lorem.ipsum.dolor.sit;

				obj.foxy[1] = "lazy";
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
			foxy: ["the", "lazy", "brown", "fox", "jumps"],
		},
	);
});

test("updating should transform aliases into merges", async () => {
	assert.equal(
		await updateString(
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
		stripIndent`
			lorem: &ipsum { dolor: true }
			foo:
				bar:
					<<: *ipsum
					added: true
					addedToo: true
		`,
	);

	assert.equal(
		await updateString(
			stripIndent`
				lorem: &ipsum { dolor: true }
				foo:
					bar: *ipsum
			`,
			(object: any) => {
				object.foo.bar = "changed";
			},
		),
		stripIndent`
			lorem: &ipsum { dolor: true }
			foo:
				bar: changed
		`,
	);

	assert.equal(
		await updateString(
			stripIndent`
				lorem:
					&ipsum { dolor: true }
				foo:
					bar: *ipsum
			`,
			(object: any) => {
				object.foo.bar.dolor = "changed";
			},
		),
		stripIndent`
			lorem: &ipsum { dolor: true }
			foo:
				bar:
					<<: *ipsum
					dolor: changed
		`,
	);

	assert.equal(
		await updateString(
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
		stripIndent`
			lorem: &ipsum { dolor: true }
			foo:
				bar:
					<<: *ipsum
					dolor: null
		`,
	);

	assert.equal(
		await updateString(
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
		stripIndent`
			lorem: &ipsum
				dolor: &amet { sit: true }
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

test("updating should handle changes on merged objects", async () => {
	assert.equal(
		await updateString(
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
		stripIndent`
			lorem: &ipsum
				dolor: &amet { sit: true }
				quux: *amet
			foo:
				bar:
					<<: *ipsum
		`,
	);

	assert.equal(
		await updateString(
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
		stripIndent`
			lorem: &ipsum
				dolor: &amet { sit: true }
				quux: *amet
			foo:
				bar:
					<<: *ipsum
					dolor: { sit: true, added: true }
		`,
	);

	assert.equal(
		await updateString(
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
		stripIndent`
			lorem: &ipsum
				dolor: &amet { sit: true }
				quux: *amet
			foo:
				bar:
					<<: *ipsum
					quux: null
		`,
	);

	assert.equal(
		await updateString(
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
		stripIndent`
			lorem: &ipsum
				dolor: &amet { sit: true }
				quux: *amet
			foo:
				bar:
					<<: *ipsum
					quux:
						<<: *amet
						sit: false
		`,
	);

	assert.equal(
		await updateString(
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
		stripIndent`
			lorem: &ipsum
				dolor: &amet { sit: &sit true }
				quux: *amet
			foo:
				bar: &bar
					<<: *ipsum
				baz:
					<<: *bar
					dolor: { sit: *sit, added: true }
		`,
	);
});

async function parse(content: string) {
	const host = new TestSingleFileWorkspaceHost("test.yaml", content);

	return await createFileHandle(
		await createTextFileHandle(host, "test.yaml", ["test.yaml"]),
		"test.yaml",
	).read();
}

async function write(content: JsonObject) {
	const host = new TestSingleFileWorkspaceHost("test.yaml", "");

	await createFileHandle(
		await createTextFileHandle(host, "test.yaml", ["test.yaml"]),
		"test.yaml",
	).write(content, {});

	return YAML.parse(host.currentContent);
}

async function update(
	source: JsonObject,
	updater: (value: JsonObject) => void | Promise<void>,
) {
	const host = new TestSingleFileWorkspaceHost(
		"test.yaml",
		YAML.stringify(source),
	);

	await createFileHandle(
		await createTextFileHandle(host, "test.yaml", ["test.yaml"]),
		"test.yaml",
	).update(updater);

	return YAML.parse(host.currentContent);
}

async function updateString(
	source: string,
	updater: (value: JsonObject) => void | Promise<void>,
) {
	const host = new TestSingleFileWorkspaceHost("test.yaml", source);

	await createFileHandle(
		await createTextFileHandle(host, "test.yaml", ["test.yaml"]),
		"test.yaml",
	).update(updater);

	return host.currentContent;
}

test.run();
