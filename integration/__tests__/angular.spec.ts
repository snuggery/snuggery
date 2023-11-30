/* cspell:ignore fesm rebeccapurple */

import assert from "node:assert";
import {readFile, stat} from "node:fs/promises";
import {join} from "node:path";
import {suite} from "uvu";

import {inFixture} from "./setup";

const test = suite("angular");

test(
	"the standalone project",
	inFixture("angular", async ({expectSuccessfulRun, directory}) => {
		await expectSuccessfulRun(["build", "@integration/standalone"]);

		const outputFolder = join(directory, "packages/standalone/dist");
		const packageJson = JSON.parse(
			await readFile(join(outputFolder, "package.json"), "utf8"),
		);
		const fesm = await readFile(
			join(outputFolder, "fesm2022/standalone.js"),
			"utf8",
		);

		// Expect exports to be defined correctly
		assert.deepStrictEqual(packageJson.exports["."], {
			types: "./index.d.ts",
			esm: "./esm2022/index.js",
			esm2022: "./esm2022/index.js",
			default: "./fesm2022/standalone.js",
		});
		assert.deepStrictEqual(packageJson.exports["./sub"], {
			types: "./sub.d.ts",
			esm: "./esm2022/sub.js",
			esm2022: "./esm2022/sub.js",
			default: "./fesm2022/sub.js",
		});

		assert.strictEqual(packageJson.sideEffects, false);

		// expect the module and component to be defined
		assert.match(fesm, /MyComponent/);
		assert.match(fesm, /StandaloneModule/);

		// expect the scss to be compiled
		assert.doesNotMatch(fesm, /@use/);
		assert.match(fesm, /rebeccapurple|#639/);

		// expect tslib to have been removed
		assert.doesNotMatch(
			await readFile(join(outputFolder, "package.json"), "utf8"),
			/tslib/,
		);

		// Expect the .d.ts files not to be flattened
		const subDts = await readFile(join(outputFolder, "sub.d.ts"), "utf8");
		assert.doesNotMatch(subDts, /export declare class SubModule/);
		assert.match(subDts, /export \* from '.\/types\/sub\.js';/);
		assert.ok(await stat(join(outputFolder, "types")));

		await expectSuccessfulRun([
			"build",
			"@integration/standalone",
			"--configuration",
			"enable-api-extractor",
		]);

		// Expect the .d.ts files to be flattened
		assert.match(
			await readFile(join(outputFolder, "sub.d.ts"), "utf8"),
			/export declare class SubModule/,
		);
		await assert.rejects(stat(join(outputFolder, "types")));
	}),
);

test(
	"the dependent project",
	inFixture("angular", async ({expectSuccessfulRun, directory}) => {
		await expectSuccessfulRun(["build", "@integration/dependent"]);

		const outputFolder = join(directory, "packages/dependent/dist");
		const [component, fesm] = await Promise.all([
			readFile(join(outputFolder, "esm2022/other.component.js"), "utf-8"),
			readFile(join(outputFolder, "fesm2022/dependent.js"), "utf8"),
		]);

		// expect the compiler to have inserted valid imports
		assert.match(component, /import \* as i1 from "@integration\/standalone";/);

		// expect the module and component to be defined
		assert.match(fesm, /OtherComponent/);
		assert.match(fesm, /DependentModule/);

		// expect the scss to be compiled
		assert.doesNotMatch(fesm, /@use/);
		assert.match(fesm, /rebeccapurple|#639/);
	}),
);

test.run();
