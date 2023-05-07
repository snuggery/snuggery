import {SchematicTestRunner} from '@angular-devkit/schematics/testing';
import assert from 'node:assert/strict';
import {test} from 'uvu';

test('it should update package.json files', async () => {
	const runner = new SchematicTestRunner(
		'test',
		require.resolve('./collection.json'),
	);

	let tree = await runner.runSchematic('init');
	tree = await runner.runSchematic('main-to-export', undefined, tree);

	assert.equal(
		tree.readText('package.json'),
		['{', '  "name": "test",', '  "exports": "./main.js"', '}', ''].join('\n'),
	);

	assert.deepEqual(tree.readJson('node_modules/lorem/package.json'), {
		name: 'lorem',
		main: './dist/index.cjs',
	});
});

test.run();
