import {tags} from '@angular-devkit/core';
import {SchematicTestRunner} from '@angular-devkit/schematics/testing';
import assert from 'node:assert/strict';
import {test} from 'uvu';

test('it should update workspaces', async () => {
	const runner = new SchematicTestRunner(
		'test',
		require.resolve('./collection.json'),
	);

	let tree = await runner.runSchematic('init');
	tree = await runner.runSchematic('add-prefix', undefined, tree);

	assert.equal(
		tree.readContent('angular.json').trim(),
		tags.stripIndent`
			{
				"version": 1,
				"projects": {
					"app": {
						"root": "",
						"projectType": "application",
						"prefix": "pref"
					}
				}
			}
		`,
	);
});

test.run();
