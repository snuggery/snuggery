// cspell:ignore unparse serializers

/**
 * @fileoverview Implements two-way conversion between the workspace configuration types and
 * the experimental KDL format supported by snuggery (snuggery.kdl, version 0)
 */

import type {JsonValue} from '@angular-devkit/core';
import {
	Document,
	Entry,
	format,
	Identifier,
	InvalidKdlError,
	Node,
	parse,
	Value,
} from '@bgotink/kdl';

import type {TextFileHandle} from '../../file';
import {Change, ChangeType} from '../../proxy';
import {AbstractFileHandle} from '../../split/file/abstract';
import {AngularWorkspaceHandle} from '../../split/workspace-handle/angular';
import {
	InvalidConfigurationError,
	JsonPropertyName,
	JsonPropertyPath,
	stringifyPath,
	type JsonObject,
} from '../../types';

import {
	addEntry,
	addValue,
	arrayItemKey,
	deleteEntry,
	deleteValue,
	EntrySerializer,
	findArrayItems,
	fromJsonObject,
	fromJsonValue,
	modifyEntry,
	modifyValue,
	toJsonObject,
	toJsonValue,
} from './kdl-json';
import {getDocument, replaceNodeInPlace} from './kdl-utils';
import {projectRelative} from './serializers';

function getSingleValue(node: Node, location: string): Value['value'] {
	const values = node.entries.filter(entry => entry.name == null);

	if (values.length !== 1) {
		throw new InvalidConfigurationError(`Expected a single value ${location}`);
	}

	return values[0]!.value.value;
}

function getSingleStringValue(node: Node, location: string): string {
	const value = getSingleValue(node, location);

	if (typeof value !== 'string') {
		throw new InvalidConfigurationError(
			`Expected a string but got ${
				value == null ? 'null' : typeof value
			} ${location}`,
		);
	}

	return value;
}

function parseConfiguration(
	projectName: string,
	targetName: string,
	node: Node,
	{
		serializers,
		baseConfigurations,
	}: {
		serializers?: Map<string, EntrySerializer>;
		baseConfigurations?: Document | null;
	} = {},
): [string, JsonObject] {
	const name = getSingleStringValue(
		node,
		`in configuration for target ${targetName} in project ${projectName}`,
	);
	return [
		name,
		toJsonObject(node, {
			allowArray: false,
			ignoreValues: true,
			serializers,
			baseNode: baseConfigurations?.nodes.find(
				baseNode =>
					baseNode.name.name === 'configuration' &&
					getSingleStringValue(baseNode, '') === name,
			),
		}),
	];
}

function unparseConfiguration(name: string, configuration: JsonObject): Node {
	const node = fromJsonObject(configuration, 'configuration', {
		ignoreEntries: true,
	});

	node.entries.unshift(new Entry(new Value(name), null));

	return node;
}

function parseTarget(
	projectName: string,
	node: Node,
	{
		serializers,
		baseTargets,
	}: {
		serializers?: Map<string, EntrySerializer>;
		baseTargets?: Document | null;
	} = {},
): [string, JsonObject] {
	const name = getSingleStringValue(
		node,
		`in target for project ${projectName}`,
	);
	const baseTarget = baseTargets?.nodes.find(
		baseNode =>
			baseNode.name.name === 'target' &&
			getSingleStringValue(baseNode, '') === name,
	);
	const target = toJsonObject(node, {
		allowArray: false,
		ignoreValues: true,
		ignoreChildren: new Set(['configuration']),
		serializers,
		baseNode: baseTarget,
	});

	if (baseTarget?.children != null) {
		target.configurations = Object.fromEntries(
			baseTarget.children.nodes
				.filter(node => node.name.name === 'configuration')
				.map(node =>
					parseConfiguration(projectName, name, node, {
						serializers,
					}),
				),
		);
	}

	if (node.children != null) {
		target.configurations = {
			...(target.configurations as JsonObject | undefined),
			...Object.fromEntries(
				node.children?.nodes
					.filter(node => node.name.name === 'configuration')
					.map(node =>
						parseConfiguration(projectName, name, node, {
							serializers,
							baseConfigurations: baseTarget?.children,
						}),
					),
			),
		};
	}

	return [name, target];
}

function unparseTarget(name: string, target: JsonObject): Node {
	const node = new Node(new Identifier('target'), [
		new Entry(new Value(name), null),
		new Entry(new Value(target.builder as string), new Identifier('builder')),
	]);

	if (target.defaultConfiguration != null) {
		node.entries.push(
			new Entry(
				new Value(target.defaultConfiguration as string),
				new Identifier('defaultConfiguration'),
			),
		);
	}

	const children = Object.entries(target).flatMap(([propertyName, value]) => {
		switch (propertyName) {
			case 'builder':
			case 'defaultConfiguration':
				return [];
			case 'configurations':
				return Object.entries(value as JsonObject).map(
					([configurationName, configuration]) =>
						unparseConfiguration(
							configurationName,
							configuration as JsonObject,
						),
				);
			case 'options': {
				const options = fromJsonObject(value as JsonObject, propertyName, {
					ignoreEntries: true,
				});
				if (!options.entries.length && options.children == null) {
					return [];
				}
				return options;
			}
			default:
				return fromJsonValue(value, propertyName);
		}
	});

	if (children.length > 0) {
		node.children = new Document(children);
	}

	return node;
}

function parseProject(
	node: Node,
	{
		serializers,
		abstractProjects,
	}: {
		serializers?: Map<string, EntrySerializer>;
		abstractProjects: Map<string, Node>;
	},
): [string, JsonObject] {
	const name = getSingleStringValue(node, `for project`);

	let baseProject: Node | undefined;
	const baseName = node.entries.find(entry => entry.name?.name === 'extends')
		?.value.value;
	if (baseName != null) {
		baseProject = abstractProjects.get(baseName as string);
		if (baseProject == null) {
			throw new InvalidConfigurationError(
				`Project ${JSON.stringify(
					name,
				)} extends nonexistent abstract project ${JSON.stringify(baseName)}`,
			);
		}
	}

	const projectSerializers = new Map(serializers);
	projectSerializers.set('project-relative', projectRelative(node));

	const project = toJsonObject(node, {
		allowArray: false,
		ignoreValues: true,
		ignoreChildren: new Set(['target']),
		ignoreEntries: new Set(['extends']),
		serializers: projectSerializers,
		baseNode: baseProject,
	});

	if (baseProject?.children != null) {
		project.targets = Object.fromEntries(
			baseProject.children.nodes
				.filter(node => node.name.name === 'target')
				.map(node =>
					parseTarget(name, node, {
						serializers: projectSerializers,
					}),
				),
		);
	}

	if (node.children != null) {
		project.targets = {
			...(project.targets as JsonObject | undefined),
			...Object.fromEntries(
				node.children.nodes
					.filter(node => node.name.name === 'target')
					.map(node =>
						parseTarget(name, node, {
							serializers: projectSerializers,
							baseTargets: baseProject?.children,
						}),
					),
			),
		};
	}

	return [name, project];
}

function unparseProject(name: string, project: JsonObject): Node {
	const node = new Node(new Identifier('project'), [
		new Entry(new Value(name), null),
		new Entry(new Value(project.root as string), new Identifier('root')),
	]);

	for (const key of ['projectType', 'sourceRoot', 'prefix']) {
		if (project[key] != null) {
			node.entries.push(
				new Entry(new Value(project[key] as string), new Identifier(key)),
			);
		}
	}

	const children = Object.entries(project).flatMap(([propertyName, value]) => {
		switch (propertyName) {
			case 'root':
			case 'projectType':
			case 'sourceRoot':
			case 'prefix':
				return [];
			case 'architect':
			case 'targets':
				return Object.entries(value as JsonObject).map(([targetName, target]) =>
					unparseTarget(targetName, target as JsonObject),
				);
			default:
				return fromJsonValue(value, propertyName);
		}
	});

	if (children.length > 0) {
		node.children = new Document(children);
	}

	return node;
}

function findChildrenArray(
	nodeOrDocument: Node | Document,
	name: string,
	change: Change,
): Node[] {
	const items = findArrayItems(nodeOrDocument, name);

	if (items === null || !('nodes' in items)) {
		throw new Error(`Failed to find ${stringifyPath(change.path)} to modify`);
	}

	return items.nodes;
}

function findNamedChild(
	nodeOrDocument: Node | Document,
	name: string,
	parameter: Value['value'] | undefined,
	change: Change,
): Node {
	const document =
		nodeOrDocument instanceof Document
			? nodeOrDocument
			: nodeOrDocument.children;
	const children = document?.nodes.filter(node => {
		if (node.name.name !== name) {
			return false;
		}

		return (
			parameter === undefined || node.entries[0]?.value.value === parameter
		);
	});

	if (!children?.length) {
		throw new Error(`Failed to find ${stringifyPath(change.path)} to modify`);
	}

	if (children.length > 1) {
		throw new Error(
			`Failed to find single ${stringifyPath(change.path)} to modify`,
		);
	}

	return children[0]!;
}

function applyChangeToJsonArray(
	nodeOrDocument: Node | Document,
	name: string,
	path: [number, ...JsonPropertyPath],
	change: Change,
): void {
	const [index, ...restPath] = path as [
		number,
		...([string, ...JsonPropertyPath] | [number, ...JsonPropertyPath] | [])
	];

	if (isEmpty(restPath)) {
		switch (change.type) {
			case ChangeType.Add:
				addEntry(change.path, nodeOrDocument, name, change.value);
				break;
			case ChangeType.Delete:
				deleteEntry(change.path, nodeOrDocument, name, index);
				break;
			case ChangeType.Modify:
				modifyEntry(change.path, nodeOrDocument, index, name, change.value);
				break;
		}

		return;
	}

	const item = findChildrenArray(nodeOrDocument, name, change)[index];
	if (item == null) {
		throw new Error(`Failed to find ${stringifyPath(change.path)} to modify`);
	}

	if (startsWithIndex(restPath)) {
		return applyChangeToJsonArray(item, arrayItemKey, restPath, change);
	} else {
		return applyChangeToJsonObject(item, restPath, change);
	}

	function isEmpty(value: unknown[]): value is [] {
		return value.length === 0;
	}

	function startsWithIndex(
		value: [JsonPropertyName, ...unknown[]],
	): value is [number, ...unknown[]] {
		return typeof value[0] === 'number';
	}
}

function applyChangeToJsonObject(
	nodeOrDocument: Node | Document,
	path: [string, ...JsonPropertyPath],
	change: Change,
): void {
	const [property, ...restPath] = path as [
		string,
		...([string, ...JsonPropertyPath] | [number, ...JsonPropertyPath] | [])
	];

	if (isEmpty(restPath)) {
		switch (change.type) {
			case ChangeType.Add:
				addValue(change.path, nodeOrDocument, property, change.value);
				break;
			case ChangeType.Delete:
				deleteValue(nodeOrDocument, property);
				break;
			case ChangeType.Modify:
				modifyValue(change.path, nodeOrDocument, property, change.value);
				break;
		}

		return;
	}

	if (startsWithProperty(restPath)) {
		return applyChangeToJsonObject(
			findNamedChild(nodeOrDocument, property, undefined, change),
			restPath,
			change,
		);
	} else {
		return applyChangeToJsonArray(nodeOrDocument, property, restPath, change);
	}

	function isEmpty(value: unknown[]): value is [] {
		return value.length === 0;
	}

	function startsWithProperty(
		value: [JsonPropertyName, ...unknown[]],
	): value is [string, ...unknown[]] {
		return typeof value[0] === 'string';
	}
}

function parseWorkspace(
	document: Document,
	{serializers}: {serializers?: Map<string, EntrySerializer>} = {},
): JsonObject {
	const workspace: [string, JsonValue][] = [];

	const allProjectNodes = document.nodes.filter(
		node => node.name.name === 'project',
	);

	const abstractProjects = new Map(
		allProjectNodes
			.filter(node => node.tag?.name === 'abstract')
			.map(node => [getSingleStringValue(node, `for abstract project`), node]),
	);

	const projects = allProjectNodes
		.filter(node => node.tag?.name !== 'abstract')
		.map(node => parseProject(node, {serializers, abstractProjects}));

	for (const node of document.nodes) {
		if (node.name.name === 'project') {
			continue;
		}

		workspace.push([node.name.name, toJsonValue(node, {serializers})]);
	}

	if (projects.length) {
		workspace.push(['projects', Object.fromEntries(projects)]);
	}

	workspace.push(['version', 1]);

	return Object.fromEntries(workspace);
}

function unparseWorkspace(workspace: JsonObject): Document {
	return new Document(
		Object.entries(workspace).flatMap(([name, value]) => {
			switch (name) {
				case 'projects':
					return Object.entries(value as JsonObject).map(
						([projectName, project]) =>
							unparseProject(projectName, project as JsonObject),
					);
				case 'version':
					return fromJsonValue(0, name);
				default:
					return fromJsonValue(value, name);
			}
		}),
	);
}

class SnuggeryWorkspaceFileHandle extends AbstractFileHandle<Document> {
	parse(content: string): Document {
		try {
			return parse(content);
		} catch (e) {
			if (e instanceof InvalidKdlError) {
				throw new InvalidConfigurationError(e.message);
			}

			throw e;
		}
	}

	getValue(document: Document): JsonObject {
		return parseWorkspace(document);
	}

	stringify(value: JsonObject): string {
		return format(unparseWorkspace(value));
	}

	createHeader(header: string | string[]): string {
		if (Array.isArray(header)) {
			return `/*\n${header.map(line => ` * ${line}`).join('\n')}\n */\n`;
		}

		return `// ${header}\n`;
	}

	applyChanges(
		_source: string,
		document: Document,
		changes: readonly Change[],
	): string {
		for (const change of changes) {
			let path = Array.from(change.path) as [string, ...JsonPropertyPath];

			if (change.path[0] !== 'projects') {
				applyChangeToJsonObject(document, path, change);
				continue;
			}

			if (path.length === 1) {
				if (change.type !== ChangeType.Add) {
					document.nodes = document.nodes.filter(
						node => node.name.name !== 'project',
					);
				}

				if (change.type !== ChangeType.Delete) {
					document.nodes.push(
						...Object.entries(change.value as JsonObject).map(
							([name, project]) => unparseProject(name, project as JsonObject),
						),
					);
				}

				continue;
			}

			const projectName = change.path[1] as string;

			if (path.length === 2) {
				switch (change.type) {
					case ChangeType.Delete:
						document.nodes.splice(
							document.nodes.indexOf(
								findNamedChild(document, 'project', projectName, change),
							),
						);
						break;
					case ChangeType.Add: {
						const allProjects = document.nodes.filter(
							node => node.name.name === 'project',
						);
						document.nodes.splice(
							document.nodes.indexOf(allProjects[allProjects.length - 1]!) + 1,
							0,
							unparseProject(projectName, change.value as JsonObject),
						);
						break;
					}
					case ChangeType.Modify:
						replaceNodeInPlace(
							findNamedChild(document, 'project', projectName, change),
							unparseProject(projectName, change.value as JsonObject),
						);
						break;
				}

				continue;
			}

			const project = findNamedChild(document, 'project', projectName, change);
			path = path.slice(2) as [string, ...JsonPropertyPath];

			if (path[0] !== 'targets' && path[0] !== 'architect') {
				applyChangeToJsonObject(project, path, change);
				continue;
			}

			if (path.length === 1) {
				if (change.type !== ChangeType.Add) {
					if (project.children != null) {
						project.children.nodes = project.children.nodes.filter(
							node => node.name.name !== 'target',
						);
						if (project.children.nodes.length === 0) {
							project.children = null;
						}
					}
				}

				if (change.type !== ChangeType.Delete) {
					getDocument(project, true).nodes.push(
						...Object.entries(change.value as JsonObject).map(
							([name, target]) => unparseTarget(name, target as JsonObject),
						),
					);
				}

				continue;
			}

			const targetName = path[1] as string;

			if (path.length === 2) {
				switch (change.type) {
					case ChangeType.Delete: {
						const target = findNamedChild(
							project,
							'target',
							targetName,
							change,
						);

						project.children!.nodes.splice(
							project.children!.nodes.indexOf(target),
						);
						break;
					}
					case ChangeType.Add: {
						const projectDoc = getDocument(project, true);
						const allTargets = projectDoc.nodes.filter(
							node => node.name.name === 'target',
						);
						projectDoc.nodes.splice(
							projectDoc.nodes.indexOf(allTargets[allTargets.length - 1]!) + 1,
							0,
							unparseTarget(targetName, change.value as JsonObject),
						);
						break;
					}
					case ChangeType.Modify:
						replaceNodeInPlace(
							findNamedChild(project, 'target', targetName, change),
							unparseTarget(targetName, change.value as JsonObject),
						);
						break;
				}

				continue;
			}

			const target = findNamedChild(project, 'target', targetName, change);
			path = path.slice(2) as [string, ...JsonPropertyPath];

			if (path.length === 1 && path[0] === 'options') {
				if (change.type === ChangeType.Delete) {
					deleteValue(target, 'options');
					continue;
				}

				const options = fromJsonObject(change.value as JsonObject, 'options', {
					ignoreEntries: true,
				});

				if (change.type === ChangeType.Add) {
					getDocument(target, true).nodes.unshift(options);
				} else {
					replaceNodeInPlace(
						findNamedChild(target, 'options', undefined, change),
						unparseTarget(targetName, change.value as JsonObject),
					);
				}

				continue;
			}

			if (path[0] !== 'configurations') {
				applyChangeToJsonObject(target, path, change);
				continue;
			}

			if (path.length === 1) {
				if (change.type !== ChangeType.Add) {
					if (target.children != null) {
						target.children.nodes = target.children.nodes.filter(
							node => node.name.name !== 'configuration',
						);
						if (target.children.nodes.length === 0) {
							target.children = null;
						}
					}
				}

				if (change.type !== ChangeType.Delete) {
					getDocument(target, true).nodes.push(
						...Object.entries(change.value as JsonObject).map(
							([name, configuration]) =>
								unparseConfiguration(name, configuration as JsonObject),
						),
					);
				}

				continue;
			}

			const configurationName = path[1] as string;

			if (path.length === 2) {
				switch (change.type) {
					case ChangeType.Delete: {
						const configuration = findNamedChild(
							target,
							'configuration',
							configurationName,
							change,
						);

						target.children!.nodes.splice(
							target.children!.nodes.indexOf(configuration),
						);
						break;
					}
					case ChangeType.Add: {
						const projectDoc = getDocument(target, true);
						const allConfigurations = projectDoc.nodes.filter(
							node => node.name.name === 'configuration',
						);
						projectDoc.nodes.splice(
							projectDoc.nodes.indexOf(
								allConfigurations[allConfigurations.length - 1]!,
							) + 1,
							0,
							unparseConfiguration(
								configurationName,
								change.value as JsonObject,
							),
						);
						break;
					}
					case ChangeType.Modify:
						replaceNodeInPlace(
							findNamedChild(
								target,
								'configuration',
								configurationName,
								change,
							),
							unparseConfiguration(
								configurationName,
								change.value as JsonObject,
							),
						);
						break;
				}

				continue;
			}

			const configuration = findNamedChild(
				target,
				'configuration',
				configurationName,
				change,
			);
			path = path.slice(2) as [string, ...JsonPropertyPath];

			applyChangeToJsonObject(configuration, path, change);
		}

		return format(document);
	}
}

export class SnuggeryKdlWorkspaceHandle extends AngularWorkspaceHandle {
	constructor(source: TextFileHandle) {
		super(
			new SnuggeryWorkspaceFileHandle({
				source,
				async createFileHandle() {
					throw new InvalidConfigurationError(
						'Split KDL files are not currently supported',
					);
				},
			}),
		);
	}
}
