import {clearFormat, Document, format, parse} from '@bgotink/kdl';
import expect from 'expect';
import {suite} from 'uvu';

import {ChangeType} from '../../../proxy';
import {applyChangeToWorkspace} from '../apply-changes';

const document = clearFormat(
	parse(
		String.raw`
			version 0

			(abstract)project "parent" {
				target "test" builder="@lorem/ipsum:test" {
					options {
						configFiles {
							- (project-relative)"test.config.json"
							- (project-relative)"test2.config.json"
						}
						verbose false
					}
				}
			}

			project "lorem" extends="parent" root="packages/lorem" {
				target "build" builder="@lorem/ipsum:build" {
					options debug=true
				}

				target "test" {
					options {
						configFiles {
							super
							- (project-relative)"test3.config.json"
						}
					}
				}

				i18n {
					defaultLocale "en-US"
				}
			}
			
			project "ipsum" root="packages/ipsum" {
				target "build" builder="@lorem/ipsum:build" {
					configuration "production" {
						optimize true
						debug false
					}
				}
			}

			schematics {
				"@lorem/ipsum:schematic" {
					configured true
				}
			}
		`,
	),
);

const base = suite('kdl apply-changes');
const test = (
	name: string,
	fn: (value: Document, expected: Document) => void,
) => {
	base(name, () => {
		const value = document.clone();
		const expected = document.clone();

		fn(value, expected);

		expect(format(clearFormat(value))).toEqual(format(clearFormat(expected)));
	});
};

// Add

test('add workspace extension', (value, expected) => {
	expected.appendNode(
		parse(String.raw`
			cli {
				packageManager "yarn"
			}
		`),
	);

	applyChangeToWorkspace(value, value, [value], {
		type: ChangeType.Add,
		path: ['cli'],
		value: {packageManager: 'yarn'},
	});
});

test('add project extension', (value, expected) => {
	expected.findParameterizedNode('project', 'lorem')!.appendNode(
		parse(String.raw`
			cli {
				packageManager "yarn"
			}
		`),
	);

	applyChangeToWorkspace(value, value, [value], {
		type: ChangeType.Add,
		path: ['projects', 'lorem', 'cli'],
		value: {packageManager: 'yarn'},
	});
});

test('add configuration', (value, expected) => {
	expected
		.findParameterizedNode('project', 'ipsum')!
		.findParameterizedNode('target', 'build')!
		.appendNode(
			parse(String.raw`
				configuration "test" {
					added true
				}
			`),
		);

	applyChangeToWorkspace(value, value, [value], {
		type: ChangeType.Add,
		path: ['projects', 'ipsum', 'targets', 'build', 'configurations', 'test'],
		value: {added: true},
	});
});

test('add options', (value, expected) => {
	expected
		.findParameterizedNode('project', 'ipsum')!
		.findParameterizedNode('target', 'build')!
		.appendNode(
			parse(String.raw`
				options {
					added true
				}
			`),
		);

	applyChangeToWorkspace(value, value, [value], {
		type: ChangeType.Add,
		path: ['projects', 'ipsum', 'targets', 'build', 'options'],
		value: {added: true},
	});

	expected
		.findParameterizedNode('project', 'lorem')!
		.findParameterizedNode('target', 'build')!
		.findNodeByName('options')!
		.appendNode(
			parse(String.raw`
				added true
			`),
		);

	applyChangeToWorkspace(value, value, [value], {
		type: ChangeType.Add,
		path: ['projects', 'lorem', 'targets', 'build', 'options', 'added'],
		value: true,
	});
});

test('add target', (value, expected) => {
	expected.findParameterizedNode('project', 'lorem')!.appendNode(
		parse(String.raw`
			target "added" builder="@lorem/ipsum:added" {
				options {
					added true
				}
			}
		`),
	);

	applyChangeToWorkspace(value, value, [value], {
		type: ChangeType.Add,
		path: ['projects', 'lorem', 'targets', 'added'],
		value: {
			builder: '@lorem/ipsum:added',
			options: {added: true},
		},
	});
});

test('add project', (value, expected) => {
	expected.appendNode(
		parse(String.raw`
			project "added" root="packages/added" {
				target "added" builder="@lorem/ipsum:added" {
					options {
						added true
					}
				}
			}
		`),
	);

	applyChangeToWorkspace(value, value, [value], {
		type: ChangeType.Add,
		path: ['projects', 'added'],
		value: {
			root: 'packages/added',
			targets: {
				added: {
					builder: '@lorem/ipsum:added',
					options: {added: true},
				},
			},
		},
	});
});

// Delete

test('delete workspace extension', (value, expected) => {
	expected
		.findNodeByName('schematics')!
		.removeNodesByName('@lorem/ipsum:schematic');

	applyChangeToWorkspace(value, value, [value], {
		type: ChangeType.Delete,
		path: ['schematics', '@lorem/ipsum:schematic'],
		oldValue: {
			configured: true,
		},
	});
});

test('delete project extension', (value, expected) => {
	expected.findParameterizedNode('project', 'lorem')!.removeNodesByName('i18n');

	applyChangeToWorkspace(value, value, [value], {
		type: ChangeType.Delete,
		path: ['projects', 'lorem', 'i18n'],
		oldValue: {defaultLanguage: 'en-US'},
	});
});

test('delete configuration', (value, expected) => {
	expected
		.findParameterizedNode('project', 'ipsum')!
		.findParameterizedNode('target', 'build')!
		.removeNodesByName('configuration');

	applyChangeToWorkspace(value, value, [value], {
		type: ChangeType.Delete,
		path: [
			'projects',
			'ipsum',
			'targets',
			'build',
			'configurations',
			'production',
		],
		oldValue: {
			optimize: true,
			debug: false,
		},
	});
});

test('delete options', (value, expected) => {
	expected
		.findParameterizedNode('project', 'lorem')!
		.findParameterizedNode('target', 'test')!
		.removeNodesByName('options');

	applyChangeToWorkspace(value, value, [value], {
		type: ChangeType.Delete,
		path: ['projects', 'lorem', 'targets', 'test', 'options'],
		oldValue: {},
	});
});

test('delete target', (value, expected) => {
	const project = expected.findParameterizedNode('project', 'ipsum')!;
	project.removeNode(project.findParameterizedNode('target', 'build')!);

	applyChangeToWorkspace(value, value, [value], {
		type: ChangeType.Delete,
		path: ['projects', 'ipsum', 'targets', 'build'],
		oldValue: {},
	});
});

test('delete project', (value, expected) => {
	expected.removeNode(expected.findParameterizedNode('project', 'ipsum')!);

	applyChangeToWorkspace(value, value, [value], {
		type: ChangeType.Delete,
		path: ['projects', 'ipsum'],
		oldValue: {},
	});
});

// Modify

test('modify workspace extension', (value, expected) => {
	const schematics = expected.findNodeByName('schematics')!;
	schematics.replaceNode(
		schematics.findNodeByName('@lorem/ipsum:schematic')!,
		parse(String.raw`"@lorem/ipsum:schematic" {modified true;}`),
	);

	applyChangeToWorkspace(value, value, [value], {
		type: ChangeType.Modify,
		path: ['schematics', '@lorem/ipsum:schematic'],
		oldValue: {
			configured: true,
		},
		value: {modified: true},
	});
});

test('modify project extension', (value, expected) => {
	const project = expected.findParameterizedNode('project', 'lorem')!;
	project.replaceNode(
		project.findNodeByName('i18n')!,
		parse(String.raw`i18n defaultLanguage="en-GB"`),
	);

	applyChangeToWorkspace(value, value, [value], {
		type: ChangeType.Modify,
		path: ['projects', 'lorem', 'i18n'],
		oldValue: {defaultLanguage: 'en-US'},
		value: {defaultLanguage: 'en-GB'},
	});
});

test('modify configuration', (value, expected) => {
	const target = expected
		.findParameterizedNode('project', 'ipsum')!
		.findParameterizedNode('target', 'build')!;
	target.replaceNode(
		target.findParameterizedNode('configuration', 'production')!,
		parse(String.raw`
			configuration "production" {
				modified true
			}
		`),
	);

	applyChangeToWorkspace(value, value, [value], {
		type: ChangeType.Modify,
		path: [
			'projects',
			'ipsum',
			'targets',
			'build',
			'configurations',
			'production',
		],
		oldValue: {
			optimize: true,
			debug: false,
		},
		value: {modified: true},
	});
});

test('modify options', (value, expected) => {
	const buildTarget = expected
		.findParameterizedNode('project', 'lorem')!
		.findParameterizedNode('target', 'build')!;
	buildTarget.replaceNode(
		buildTarget.findNodeByName('options')!,
		parse(String.raw`
			options {
				modified true
			}
		`),
	);

	applyChangeToWorkspace(value, value, [value], {
		type: ChangeType.Modify,
		path: ['projects', 'lorem', 'targets', 'build', 'options'],
		oldValue: {},
		value: {modified: true},
	});

	const testTarget = expected
		.findParameterizedNode('project', 'lorem')!
		.findParameterizedNode('target', 'test')!;
	testTarget.replaceNode(
		testTarget.findNodeByName('options')!,
		parse(String.raw`
			(overwrite)options {
				modified true
			}
		`),
	);

	applyChangeToWorkspace(value, value, [value], {
		type: ChangeType.Modify,
		path: ['projects', 'lorem', 'targets', 'test', 'options'],
		oldValue: {},
		value: {modified: true},
	});
});

test('modify target', (value, expected) => {
	const project = expected.findParameterizedNode('project', 'ipsum')!;
	project.replaceNode(
		project.findParameterizedNode('target', 'build')!,
		parse(String.raw`
			target "build" builder="@lorem/ipsum:modified" {
				options {
					modified true
				}
			}
		`),
	);

	applyChangeToWorkspace(value, value, [value], {
		type: ChangeType.Modify,
		path: ['projects', 'ipsum', 'targets', 'build'],
		oldValue: {},
		value: {
			builder: '@lorem/ipsum:modified',
			options: {modified: true},
		},
	});
});

test('modify project', (value, expected) => {
	expected.replaceNode(
		expected.findParameterizedNode('project', 'ipsum')!,
		parse(String.raw`
			project "ipsum" root="packages/modified" {
				target "test" builder="@lorem/ipsum:modified"
			}
		`),
	);

	applyChangeToWorkspace(value, value, [value], {
		type: ChangeType.Modify,
		path: ['projects', 'ipsum'],
		oldValue: {},
		value: {
			root: 'packages/modified',
			targets: {
				test: {builder: '@lorem/ipsum:modified'},
			},
		},
	});
});

base.run();
