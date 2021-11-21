import {workspaces} from '@angular-devkit/core';
import expect from 'expect';
import {suite} from 'uvu';

import type {JsonObject} from '../../types';
import {NxWorkspaceHandle} from '../nx';

import {itShouldHandleAngularConfiguration, TestFileHandle} from './utils';

const test = suite('NxWorkspaceHandle');

itShouldHandleAngularConfiguration(test, NxWorkspaceHandle, {
	skipWriteOnly: true,
});

test('should read nx configuration correctly', async () => {
	const handle = new NxWorkspaceHandle(
		new TestFileHandle({
			version: 2,
			projects: {
				all: {
					root: '',
					targets: {
						build: {
							executor: '@snuggery/snuggery:glob',
							options: {
								include: '*',
							},
						},
					},
				},
			},
			generators: {
				'@snuggery/schematics': {
					hook: {
						'@snuggery/node:package': ['@snuggery/yarn:post-package'],
					},
				},
			},
		}),
	);

	const workspace = await handle.read();

	expect(workspace.projects.size).toBe(1);
	expect(workspace.projects.has('all')).toBe(true);
	expect(workspace.projects.get('all')!.root).toBe('');
	expect(workspace.projects.get('all')!.targets.get('build')!.options).toEqual({
		include: '*',
	});

	expect(workspace.extensions.schematics).toEqual(expect.any(Object));
	expect(
		(workspace.extensions.schematics as JsonObject)['@snuggery/schematics'],
	).toEqual({
		hook: {
			'@snuggery/node:package': ['@snuggery/yarn:post-package'],
		},
	});
});

test('should write workspaces correctly to nx configuration', async () => {
	const file = new TestFileHandle({});

	await new NxWorkspaceHandle(file).write({
		extensions: {
			schematics: {
				'@snuggery/schematics': {
					hook: {
						'@snuggery/node:package': ['@snuggery/yarn:post-package'],
					},
				},
			},
		},
		projects: new workspaces.ProjectDefinitionCollection({
			all: {
				root: '',
				targets: new workspaces.TargetDefinitionCollection({
					build: {
						builder: '@snuggery/snuggery:glob',
						options: {
							include: '*',
						},
					},
				}),
				extensions: {},
			},
		}),
	});

	expect(file.value).toEqual({
		version: 2,
		projects: {
			all: {
				root: '',
				targets: {
					build: {
						executor: '@snuggery/snuggery:glob',
						options: {
							include: '*',
						},
					},
				},
			},
		},
		generators: {
			'@snuggery/schematics': {
				hook: {
					'@snuggery/node:package': ['@snuggery/yarn:post-package'],
				},
			},
		},
	});
});

test('should update workspaces correctly via read + write as nx configuration', async () => {
	const file = new TestFileHandle({
		version: 2,
		projects: {
			all: {
				root: '',
				targets: {
					build: {
						executor: '@snuggery/snuggery:glob',
						options: {
							include: '*',
						},
					},
					test: {
						executor: '@nx/jest:jest',
					},
				},
			},
		},
		generators: {
			'@snuggery/schematics': {
				hook: {
					'@snuggery/node:package': ['@snuggery/yarn:post-package'],
				},
			},
		},
	});
	const handle = new NxWorkspaceHandle(file);

	const workspace = await handle.read();

	const testProject = workspace.projects.add({
		name: 'test',
		root: 'packages/test',
	});
	testProject.targets.add({
		name: 'build',
		builder: '@snuggery/node:build',
	}).options = {
		packager: '@snuggery/yarn',
	};

	const allProject = workspace.projects.get('all')!;

	allProject.targets.delete('test');
	allProject.targets.delete('e2e');
	allProject.targets.get('build')!.options!.include = ['*'];

	await handle.write(workspace);

	expect(file.value).toEqual({
		version: 2,
		projects: {
			all: {
				root: '',
				targets: {
					build: {
						executor: '@snuggery/snuggery:glob',
						options: {
							include: ['*'],
						},
					},
				},
			},
			test: {
				root: 'packages/test',
				targets: {
					build: {
						executor: '@snuggery/node:build',
						options: {
							packager: '@snuggery/yarn',
						},
					},
				},
			},
		},
		generators: {
			'@snuggery/schematics': {
				hook: {
					'@snuggery/node:package': ['@snuggery/yarn:post-package'],
				},
			},
		},
	});
});

test('should update workspaces correctly via update as nx configuration', async () => {
	const file = new TestFileHandle({
		version: 2,
		projects: {
			all: {
				root: '',
				targets: {
					build: {
						executor: '@snuggery/snuggery:glob',
						options: {
							include: '*',
						},
					},
					test: {
						executor: '@nx/jest:jest',
					},
				},
			},
		},
		generators: {
			'@snuggery/schematics': {
				hook: {
					'@snuggery/node:package': ['@snuggery/yarn:post-package'],
				},
			},
		},
	});

	await new NxWorkspaceHandle(file).update(workspace => {
		const testProject = workspace.projects.add({
			name: 'test',
			root: 'packages/test',
		});
		testProject.targets.add({
			name: 'build',
			builder: '@snuggery/node:build',
		}).options = {
			packager: '@snuggery/yarn',
		};

		const allProject = workspace.projects.get('all')!;

		allProject.targets.delete('test');
		allProject.targets.delete('e2e');
		allProject.targets.get('build')!.options!.include = ['*'];
	});

	expect(file.value).toEqual({
		version: 2,
		projects: {
			all: {
				root: '',
				targets: {
					build: {
						executor: '@snuggery/snuggery:glob',
						options: {
							include: ['*'],
						},
					},
				},
			},
			test: {
				root: 'packages/test',
				targets: {
					build: {
						executor: '@snuggery/node:build',
						options: {
							packager: '@snuggery/yarn',
						},
					},
				},
			},
		},
		generators: {
			'@snuggery/schematics': {
				hook: {
					'@snuggery/node:package': ['@snuggery/yarn:post-package'],
				},
			},
		},
	});
});

test.run();
