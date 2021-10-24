import {JsonObject, JsonValue, workspaces} from '@angular-devkit/core';
import {parse} from 'jsonc-parser';

import type {WorkspaceType} from './interface';

export function isTaoWorkspace(name: string, workspace: JsonObject): boolean {
	return /^\.?workspace.json$/.test(name) && workspace.version === 2;
}

export const taoWorkspace: WorkspaceType = {
	async parse(path, host) {
		const content = parse(await host.readFile(path), undefined, {
			allowTrailingComma: true,
			allowEmptyContent: false,
		}) as JsonValue;

		assertIsObject('the workspace', content, false);

		const {projects, generators, ...extensions} = content;

		assertIsObject('"projects"', projects, true);
		assertIsObject('"generators"', generators, true);

		return {
			extensions: generators
				? {...extensions, schematics: generators}
				: extensions,
			projects: new workspaces.ProjectDefinitionCollection(
				projects &&
					Object.fromEntries(
						Object.entries(projects).map(([projectName, project]) => {
							assertIsObject(`project "${projectName}"`, project, false);
							return [projectName, parseProject(project)];
						}),
					),
			),
		};
	},

	async write() {
		throw new Error('Writing nx/tao workspaces is not yet supported');
	},
};

function parseProject(object: JsonObject): workspaces.ProjectDefinition {
	const {
		root,
		prefix,
		sourceRoot,

		targets,

		generators,
		...extensions
	} = object;

	assertIsString('root', root, false);
	assertIsString('prefix', prefix, true);
	assertIsString('sourceRoot', sourceRoot, true);

	assertIsObject('"targets"', targets, true);
	assertIsObject('"generators"', generators, true);

	return {
		root,
		prefix,
		sourceRoot,
		targets: new workspaces.TargetDefinitionCollection(
			targets &&
				Object.fromEntries(
					Object.entries(targets).map(([targetName, target]) => {
						assertIsObject(`target "${targetName}"`, target, false);
						return [targetName, parseTarget(target)];
					}),
				),
		),
		extensions: generators
			? {...extensions, schematics: generators}
			: extensions,
	};
}

function parseTarget(object: JsonObject): workspaces.TargetDefinition {
	assertIsString('executor', object.executor, false);

	assertIsObject('"options"', object.options, true);
	assertIsObject('"configurations"', object.configurations, true);

	return {
		builder: object.executor,
		options: object.options,
		configurations: object.configurations as Record<string, JsonObject>,
	};
}

function assertIsString(
	name: string,
	value: JsonValue | undefined,
	optional: true,
): asserts value is string | undefined;
function assertIsString(
	name: string,
	value: JsonValue | undefined,
	optional: false,
): asserts value is string;
function assertIsString(
	name: string,
	value: JsonValue | undefined,
	optional: boolean,
): void {
	if ((!optional || value !== undefined) && typeof value !== 'string') {
		throw new TypeError(
			`Expected "${name}" to be a string, got ${typeof value}`,
		);
	}
}

function assertIsObject(
	name: string,
	value: JsonValue | undefined,
	optional: true,
): asserts value is JsonObject | undefined;
function assertIsObject(
	name: string,
	value: JsonValue | undefined,
	optional: false,
): asserts value is JsonObject;
function assertIsObject(
	name: string,
	value: JsonValue | undefined,
	optional: boolean,
): void {
	if ((!optional || value !== undefined) && typeof value !== 'object') {
		throw new TypeError(
			`Expected ${name} to be an object, got ${typeof value}`,
		);
	}

	if (value === null) {
		throw new TypeError(`Expected ${name} to be an object, got null`);
	}

	if (Array.isArray(value)) {
		throw new TypeError(`Expected ${name} to be an object, got an array`);
	}
}
