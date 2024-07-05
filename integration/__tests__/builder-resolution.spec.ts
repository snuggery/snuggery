import assert from "node:assert/strict";
import {test} from "uvu";

import {inFixture} from "./setup";

function matchObject(actual: unknown, expected: Record<string, unknown>) {
	assert.equal(typeof actual, "object");
	assert.ok(actual);
	assert.equal(Array.isArray(actual), false);

	assert.deepEqual(
		Object.fromEntries(
			Object.entries(actual as Record<string, unknown>).filter(([key]) =>
				Reflect.has(expected, key),
			),
		),
		expected,
	);
}

test(
	"it runs builder via package",
	inFixture("builders", async ({runJson}) => {
		matchObject(await runJson(["run", "target", "fixture:installed-builder"]), {
			withDefault: "defaultValue",
		});
	}),
);

test(
	"it runs builder via package with arguments",
	inFixture("builders", async ({runJson}) => {
		matchObject(
			await runJson([
				"run",
				"target",
				"fixture:installed-builder",
				"--foo",
				"bar",
				"--with-default",
				"baz",
			]),
			{
				foo: "bar",
				withDefault: "baz",
			},
		);
	}),
);

test(
	"it runs builder via local builders.json",
	inFixture("builders", async ({runJson}) => {
		matchObject(await runJson(["run", "target", "fixture:local-builder"]), {
			withDefault: "defaultValue",
		});
	}),
);

test(
	"it runs builder via local builders.json with arguments",
	inFixture("builders", async ({runJson}) => {
		matchObject(
			await runJson([
				"run",
				"target",
				"fixture:local-builder",
				"--foo",
				"bar",
				"--with-default",
				"baz",
			]),
			{
				foo: "bar",
				withDefault: "baz",
			},
		);
	}),
);

test(
	"it runs builder via local builder.json",
	inFixture("builders", async ({runJson}) => {
		matchObject(
			await runJson(["run", "target", "fixture:local-builder-single"]),
			{
				withDefault: "defaultValue",
			},
		);
	}),
);

test(
	"it runs builder via local builder.json with arguments",
	inFixture("builders", async ({runJson}) => {
		matchObject(
			await runJson([
				"run",
				"target",
				"fixture:local-builder-single",
				"--foo",
				"bar",
				"--with-default",
				"baz",
			]),
			{
				foo: "bar",
				withDefault: "baz",
			},
		);
	}),
);

test(
	"it runs builder via implementation",
	inFixture("builders", async ({runJson}) => {
		matchObject(
			await runJson(["run", "target", "fixture:local-builder-implementation"]),
			{},
		);
	}),
);

test(
	"it runs builder via implementation with arguments",
	inFixture("builders", async ({runJson}) => {
		matchObject(
			await runJson([
				"run",
				"target",
				"fixture:local-builder-implementation",
				"--foo",
				"bar",
				"--with-default",
				"baz",
			]),
			{
				foo: "bar",
				withDefault: "baz",
			},
		);
	}),
);

test(
	"it runs builder via schema",
	inFixture("builders", async ({runJson}) => {
		matchObject(
			await runJson(["run", "target", "fixture:local-builder-schema"]),
			{
				withDefault: "defaultValue",
			},
		);
	}),
);

test(
	"it runs builder via schema with arguments",
	inFixture("builders", async ({runJson}) => {
		matchObject(
			await runJson([
				"run",
				"target",
				"fixture:local-builder-schema",
				"--foo",
				"bar",
				"--with-default",
				"baz",
			]),
			{
				foo: "bar",
				withDefault: "baz",
			},
		);
	}),
);

test.run();
