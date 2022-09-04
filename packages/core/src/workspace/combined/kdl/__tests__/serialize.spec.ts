import {clearFormat, Entry, Identifier, Node, parse} from '@bgotink/kdl';
import expect from 'expect';
import {suite} from 'uvu';

import {fromJsonObject, fromJsonValue} from '../jik/serialize';
import {serializeWorkspace} from '../serialize';

const test = suite('kdl serialize');

test('fromJsonValue should work for simple values', () => {
	expect(fromJsonValue('lorem', 2)).toEqual(
		new Node(new Identifier('lorem'), [Entry.createArgument(2)]),
	);
});

test('fromJsonObject should work for objects', () => {
	expect(fromJsonObject('parent', {node: 'lorem', is: {deep: true}})).toEqual(
		clearFormat(
			parse(String.raw`parent node="lorem" { is deep=true; }`, {as: 'node'}),
		),
	);
});

test('fromJsonObject should work for when passing arrays', () => {
	expect(
		fromJsonObject('parent', {
			node: [
				{
					object: true,
					$implicit: 'lorem',
				},
				'ipsum',
			],
		}),
	).toEqual(
		clearFormat(
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
	);
});

test('serializeWorkspace should work', () => {
	expect(
		serializeWorkspace({
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
								configFile: 'projects/parent/test.config.js',
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
								configFile: [
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
		}),
	).toEqual(
		clearFormat(
			parse(String.raw`
				version 0
	
				project "parent" root="projects/parent" {
					target "build" builder="@lorem/ipsum:dolor" {
						options {
							configFile "projects/parent/build.config.json"
							verbose false
						}
						configuration "verbose" {
							verbose true
						}
					}
					target "test" builder="@lorem/ipsum:sit" {
						options {
							configFile "projects/parent/test.config.js"
							coverage false
						}
						configuration "coverage" {
							coverage true
						}
					}
				}
	
				project "child" root="projects/child" {
					target "build" builder="@lorem/ipsum:dolor" {
						options {
							configFile "projects/child/build.config.json"
							verbose false
						}
						configuration "verbose" {
							verbose true
						}
					}
					target "test" builder="@lorem/ipsum:sit" {
						options {
							configFile "projects/child/test.config.js" "projects/child/test2.config.js"
							coverage false
						}
						configuration "coverage" {
							coverage true
						}
					}
				}
			`),
		),
	);
});

test.run();
