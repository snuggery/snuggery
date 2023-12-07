import {tags} from "@angular-devkit/core";
import {SchematicTestRunner} from "@angular-devkit/schematics/testing";
import assert from "node:assert/strict";
import {test} from "uvu";

test("it should map imports", async () => {
	const runner = new SchematicTestRunner(
		"test",
		require.resolve("./collection.json"),
	);

	let tree = await runner.runSchematic("init");
	const originalContent = tree.readContent("file.ts").trim();

	tree = await runner.runSchematic("replace-lorem-ipsum", undefined, tree);

	for (const file of ["file.ts", "other.ts"]) {
		assert.notEqual(tree.readContent(file).trim(), originalContent);

		assert.equal(
			tree.readContent(file).trim(),
			tags.stripIndent`
				import { unchanged, newName, NewName } from "@lorem/ipsum";
				import { moved, amet as aliasedImport, Moved, Amet } from "@dolor/sit";

				export { NewName, NewName as Renamed } from "@lorem/ipsum";
				export { Moved, Moved as Alias } from "@dolor/sit";
				export {moved, moved as alias, newName as renamed, newName};

				export const var1: NewName<import("@dolor/sit").Moved>;
				export const var2: import("@dolor/sit").Amet<Moved, NewName>;
				export const var3 = newName(moved, aliasedImport, unchanged);
			`,
		);
	}
});

test("it should map imports", async () => {
	const runner = new SchematicTestRunner(
		"test",
		require.resolve("./collection.json"),
	);

	let tree = await runner.runSchematic("init");
	const originalContent = tree.readContent("file.ts").trim();

	tree = await runner.runSchematic(
		"partial-replace-lorem-ipsum",
		undefined,
		tree,
	);

	assert.equal(
		tree.readContent("file.ts").trim(),
		tags.stripIndent`
			import { unchanged, newName, NewName } from "@lorem/ipsum";
			import { moved, amet as aliasedImport, Moved, Amet } from "@dolor/sit";

			export { NewName, NewName as Renamed } from "@lorem/ipsum";
			export { Moved, Moved as Alias } from "@dolor/sit";
			export {moved, moved as alias, newName as renamed, newName};

			export const var1: NewName<import("@dolor/sit").Moved>;
			export const var2: import("@dolor/sit").Amet<Moved, NewName>;
			export const var3 = newName(moved, aliasedImport, unchanged);
		`,
	);

	assert.equal(tree.readContent("other.ts").trim(), originalContent);
});

test.run();
