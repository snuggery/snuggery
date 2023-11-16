import {workspaces} from '@angular-devkit/core';
import assert from 'node:assert/strict';
import type {Test} from 'uvu';

import {JsonObject, isJsonObject} from '../../../types';
import type {FileHandle} from '../../file';
import type {WorkspaceHandleFactory} from '../types';

function clone(value: JsonObject): JsonObject {
	return JSON.parse(JSON.stringify(value));
}

export class TestFileHandle implements FileHandle {
	readonly filename = 'test.json';

	#value: JsonObject;

	constructor(value: JsonObject) {
		this.#value = clone(value);
	}

	get value(): JsonObject {
		return clone(this.#value);
	}

	async read(): Promise<JsonObject> {
		return clone(this.#value);
	}

	async write(value: JsonObject): Promise<void> {
		this.#value = clone(value);
	}

	async update(
		updater: (value: JsonObject) => void | Promise<void>,
	): Promise<void> {
		const cloned = clone(this.#value);

		await updater(cloned);

		this.#value = clone(cloned);
	}

	readRelative(): Promise<FileHandle> {
		throw new Error('readRelative not supported in tests');
	}

	async openRelative(): Promise<never> {
		throw new Error('Method not implemented.');
	}

	async openDependency(): Promise<never> {
		throw new Error('Method not implemented.');
	}
}

export function itShouldHandleAngularConfiguration(
	test: Test,
	Factory: WorkspaceHandleFactory,
	{skipWriteOnly = false} = {},
) {
	test('should read angular configuration correctly', async () => {
		const handle = new Factory(
			new TestFileHandle({
				version: 1,
				projects: {
					all: {
						root: '',
						targets: {
							build: {
								builder: '@snuggery/snuggery:glob',
								options: {
									include: '**',
								},
							},
						},
					},
				},
				schematics: {
					'@snuggery/schematics': {
						hook: {
							'@snuggery/build-node:package': ['@snuggery/yarn:post-package'],
						},
					},
				},
			}),
		);

		const workspace = await handle.read();

		assert.equal(workspace.projects.size, 1);
		assert.equal(workspace.projects.has('all'), true);
		assert.equal(workspace.projects.get('all')!.root, '');
		assert.deepEqual(
			workspace.projects.get('all')!.targets.get('build')!.options,
			{include: '**'},
		);

		assert.ok(isJsonObject(workspace.extensions.schematics));
		assert.deepEqual(
			(workspace.extensions.schematics as JsonObject)['@snuggery/schematics'],
			{
				hook: {
					'@snuggery/build-node:package': ['@snuggery/yarn:post-package'],
				},
			},
		);
	});

	if (!skipWriteOnly) {
		test('should write workspaces correctly to angular configuration', async () => {
			const file = new TestFileHandle({});

			await new Factory(file).write(
				{
					extensions: {
						schematics: {
							'@snuggery/schematics': {
								hook: {
									'@snuggery/build-node:package': [
										'@snuggery/yarn:post-package',
									],
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
										include: '**',
									},
								},
							}),
							extensions: {},
						},
					}),
				},
				{},
			);

			assert.deepEqual(file.value, {
				version: 1,
				projects: {
					all: {
						root: '',
						targets: {
							build: {
								builder: '@snuggery/snuggery:glob',
								options: {
									include: '**',
								},
							},
						},
					},
				},
				schematics: {
					'@snuggery/schematics': {
						hook: {
							'@snuggery/build-node:package': ['@snuggery/yarn:post-package'],
						},
					},
				},
			});
		});
	}

	test('should update workspaces correctly via read + write as angular configuration', async () => {
		const file = new TestFileHandle({
			version: 1,
			projects: {
				all: {
					root: '',
					targets: {
						build: {
							builder: '@snuggery/snuggery:glob',
							options: {
								include: '**',
							},
						},
						test: {
							builder: '@nrwl/jest:jest',
						},
					},
				},
			},
			schematics: {
				'@snuggery/schematics': {
					hook: {
						'@snuggery/build-node:package': ['@snuggery/yarn:post-package'],
					},
				},
			},
		});
		const handle = new Factory(file);

		const workspace = await handle.read();

		const testProject = workspace.projects.add({
			name: 'test',
			root: 'packages/test',
		});
		testProject.targets.add({
			name: 'build',
			builder: '@snuggery/build-node:build',
		}).options = {
			packager: '@snuggery/yarn',
		};

		const allProject = workspace.projects.get('all')!;

		allProject.targets.delete('test');
		allProject.targets.delete('e2e');
		allProject.targets.get('build')!.options!.include = ['**'];

		await handle.write(workspace, {});

		assert.deepEqual(file.value, {
			version: 1,
			projects: {
				all: {
					root: '',
					targets: {
						build: {
							builder: '@snuggery/snuggery:glob',
							options: {
								include: ['**'],
							},
						},
					},
				},
				test: {
					root: 'packages/test',
					targets: {
						build: {
							builder: '@snuggery/build-node:build',
							options: {
								packager: '@snuggery/yarn',
							},
						},
					},
				},
			},
			schematics: {
				'@snuggery/schematics': {
					hook: {
						'@snuggery/build-node:package': ['@snuggery/yarn:post-package'],
					},
				},
			},
		});
	});

	test('should update workspaces correctly via update as angular configuration', async () => {
		const file = new TestFileHandle({
			version: 1,
			projects: {
				all: {
					root: '',
					targets: {
						build: {
							builder: '@snuggery/snuggery:glob',
							options: {
								include: '**',
							},
						},
						test: {
							builder: '@nrwl/jest:jest',
						},
					},
				},
			},
			schematics: {
				'@snuggery/schematics': {
					hook: {
						'@snuggery/build-node:package': ['@snuggery/yarn:post-package'],
					},
				},
			},
		});

		await new Factory(file).update(workspace => {
			const testProject = workspace.projects.add({
				name: 'test',
				root: 'packages/test',
			});
			testProject.targets.add({
				name: 'build',
				builder: '@snuggery/build-node:build',
			}).options = {
				packager: '@snuggery/yarn',
			};

			const allProject = workspace.projects.get('all')!;

			allProject.targets.delete('test');
			allProject.targets.delete('e2e');
			allProject.targets.get('build')!.options!.include = ['**'];
		});

		assert.deepEqual(file.value, {
			version: 1,
			projects: {
				all: {
					root: '',
					targets: {
						build: {
							builder: '@snuggery/snuggery:glob',
							options: {
								include: ['**'],
							},
						},
					},
				},
				test: {
					root: 'packages/test',
					targets: {
						build: {
							builder: '@snuggery/build-node:build',
							options: {
								packager: '@snuggery/yarn',
							},
						},
					},
				},
			},
			schematics: {
				'@snuggery/schematics': {
					hook: {
						'@snuggery/build-node:package': ['@snuggery/yarn:post-package'],
					},
				},
			},
		});
	});
}
