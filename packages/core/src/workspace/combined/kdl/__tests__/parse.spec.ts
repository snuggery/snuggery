import {Node, parse} from '@bgotink/kdl';
import assert from 'node:assert/strict';
import {suite} from 'uvu';

import {ParserContext} from '../context';
import {toJsonObject, toJsonValue} from '../jik/parse';
import {parseWorkspace} from '../parse';

const test = suite('kdl parse');

function ctx(nodes: Node): ParserContext {
	return {
		tags: new Map(),
		node: nodes,
	};
}

test('toJsonValue should work for simple values', () => {
	assert.equal(
		toJsonValue(ctx(parse(String.raw`node "lorem"`, {as: 'node'}))),
		'lorem',
	);
});

test('toJsonObject should work for objects', () => {
	assert.deepEqual(
		toJsonObject(
			ctx(parse(String.raw`parent { node "lorem"; }`, {as: 'node'})),
		),
		{node: 'lorem'},
	);
});

test('toJsonObject should work for when passing arrays', () => {
	assert.deepEqual(
		toJsonObject(
			ctx(
				parse(
					String.raw`parent {
						node {
							- "lorem" object=true
							- "ipsum"
						}
					}`,
					{as: 'node'},
				),
			),
		),
		{
			node: [
				{
					object: true,
					$implicit: 'lorem',
				},
				'ipsum',
			],
		},
	);
});

test('parseWorkspace supports extending projects', () => {
	const workspace = parseWorkspace(
		parse(String.raw`
			version 0

			(abstract)project "grandparent" {
				target "build" builder="@lorem/ipsum:dolor" {
					options {
						configFile (project-relative)"build.config.json"
						verbose false
					}
					configuration "verbose" {
						verbose true
					}
				}
			}

			project "parent" extends="grandparent" root="projects/parent" {
				target "test" builder="@lorem/ipsum:sit" {
					options {
						(array)configFiles (project-relative)"test.config.js"
						coverage false
					}
					configuration "coverage" {
						coverage true
					}
				}
			}

			project "child" extends="parent" root="projects/child" {
				target "test" {
					options {
						configFiles {
							super
							- (project-relative)"test2.config.js"
						}
					}
				}
			}
		`),
	);

	assert.deepEqual(workspace, {
		version: 1,
		projects: {
			parent: {
				root: 'projects/parent',
				targets: {
					build: {
						builder: '@lorem/ipsum:dolor',
						options: {
							configFile: 'projects/parent/build.config.json',
							verbose: false,
						},
						configurations: {
							verbose: {
								verbose: true,
							},
						},
					},
					test: {
						builder: '@lorem/ipsum:sit',
						options: {
							configFiles: ['projects/parent/test.config.js'],
							coverage: false,
						},
						configurations: {
							coverage: {
								coverage: true,
							},
						},
					},
				},
			},
			child: {
				root: 'projects/child',
				targets: {
					build: {
						builder: '@lorem/ipsum:dolor',
						options: {
							configFile: 'projects/child/build.config.json',
							verbose: false,
						},
						configurations: {
							verbose: {
								verbose: true,
							},
						},
					},
					test: {
						builder: '@lorem/ipsum:sit',
						options: {
							configFiles: [
								'projects/child/test.config.js',
								'projects/child/test2.config.js',
							],
							coverage: false,
						},
						configurations: {
							coverage: {
								coverage: true,
							},
						},
					},
				},
			},
		},
	});
});

test.run();
