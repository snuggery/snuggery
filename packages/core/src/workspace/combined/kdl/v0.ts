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

// Helpers

function getSingleValue(node: Node, location: string): Value['value'] {
	const values = node.getArguments();

	if (values.length !== 1) {
		throw new InvalidConfigurationError(`Expected a single value ${location}`);
	}

	return values[0]!;
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

function findChildrenArray(
	nodeOrDocument: Node | Document,
	name: string,
	change: Change,
	optional?: false,
): Node[];
function findChildrenArray(
	nodeOrDocument: Node | Document,
	name: string,
	change: Change,
	optional: boolean,
): Node[] | undefined;
function findChildrenArray(
	nodeOrDocument: Node | Document,
	name: string,
	change: Change,
	optional = false,
): Node[] | undefined {
	const items = findArrayItems(nodeOrDocument, name);

	if (items == null && optional) {
		return undefined;
	}
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
	optional?: false,
): Node;
function findNamedChild(
	nodeOrDocument: Node | Document,
	name: string,
	parameter: Value['value'] | undefined,
	change: Change,
	optional: boolean,
): Node | undefined;
function findNamedChild(
	nodeOrDocument: Node | Document,
	name: string,
	parameter: Value['value'] | undefined,
	change: Change,
	optional = false,
): Node | undefined {
	const child =
		parameter === undefined
			? nodeOrDocument.findNodeByName(name)
			: nodeOrDocument.findParameterizedNode(name, parameter);

	if (child == null) {
		if (optional) {
			return undefined;
		}

		throw new Error(`Failed to find ${stringifyPath(change.path)} to modify`);
	}

	return child;
}

function applyChangeToJsonArray(
	nodeOrDocument: Node | Document,
	extendedNodeOrDocument: Node | Document | undefined,
	name: string,
	path: [number, ...JsonPropertyPath],
	change: Change,
): void {
	const [index, ...restPath] = path as [
		number,
		...([string, ...JsonPropertyPath] | [number, ...JsonPropertyPath] | [])
	];

	let items;
	if (extendedNodeOrDocument == null) {
		items = findChildrenArray(nodeOrDocument, name, change);
	} else {
		items = findChildrenArray(nodeOrDocument, name, change, true);

		if (
			items?.some(
				item => item.getTag() === 'prepend' || item.getTag() === 'append',
			)
		) {
			const extendedItems = findChildrenArray(
				extendedNodeOrDocument,
				name,
				change,
				true,
			);

			if (extendedItems != null) {
				const prepended =
					items?.filter(node => node.getTag() === 'prepend') ?? [];
				const appended =
					items?.filter(node => node.getTag() === 'append') ?? [];

				const clonedExtendedItems = extendedItems.map(node => node.clone());
				nodeOrDocument.appendNode(new Document([...clonedExtendedItems]));

				items = [...prepended, ...clonedExtendedItems, ...appended];
			}
		}
	}

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
		return applyChangeToJsonArray(
			item,
			undefined,
			arrayItemKey,
			restPath,
			change,
		);
	} else {
		return applyChangeToJsonObject(item, undefined, restPath, change);
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
	extendedNodeOrDocument: Node | Document | undefined,
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
		let child, extendedChild;
		if (extendedNodeOrDocument == null) {
			child = findNamedChild(nodeOrDocument, property, undefined, change);
		} else {
			extendedChild = findNamedChild(
				extendedNodeOrDocument,
				property,
				undefined,
				change,
				true,
			);
			// if we're extending, the property needn't exist on the actual node itself
			child = findNamedChild(
				nodeOrDocument,
				property,
				undefined,
				change,
				extendedChild != null,
			);

			if (child == null) {
				// Create a child node so we can continue applying the change
				child = Node.create(property);
				child.setTag('merge');
			}
		}

		return applyChangeToJsonObject(child, extendedChild, restPath, change);
	} else {
		return applyChangeToJsonArray(
			nodeOrDocument,
			extendedNodeOrDocument,
			property,
			restPath,
			change,
		);
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

// Configuration

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
			baseNode: baseConfigurations?.findParameterizedNode(
				'configuration',
				name,
			),
		}),
	];
}

function unparseConfiguration(name: string, configuration: JsonObject): Node {
	const node = fromJsonObject(configuration, 'configuration', {
		ignoreEntries: true,
	});

	node.entries.unshift(Entry.createArgument(name));

	return node;
}

function applyChangeToConfiguration(
	target: Node,
	baseTarget: Node | undefined,
	configurationName: string,
	path: JsonPropertyPath,
	change: Change,
) {
	const baseConfiguration =
		baseTarget &&
		findNamedChild(
			baseTarget,
			'configuration',
			configurationName,
			change,
			true,
		);

	if (path.length > 0) {
		const configuration = findNamedChild(
			target,
			'configuration',
			configurationName,
			change,
		);

		applyChangeToJsonObject(
			configuration,
			baseConfiguration,
			path as [string, ...JsonPropertyPath],
			change,
		);

		return;
	}

	switch (change.type) {
		case ChangeType.Delete: {
			target.removeNode(
				findNamedChild(target, 'configuration', configurationName, change),
			);
			break;
		}
		case ChangeType.Add: {
			const projectDoc = getDocument(target, true);
			const allConfigurations = target.findNodesByName('configuration');
			projectDoc.insertNodeAfter(
				unparseConfiguration(configurationName, change.value as JsonObject),
				allConfigurations[allConfigurations.length - 1]! ??
					target.findNodeByName('options'),
			);
			break;
		}
		case ChangeType.Modify:
			replaceNodeInPlace(
				findNamedChild(target, 'configuration', configurationName, change),
				unparseConfiguration(configurationName, change.value as JsonObject),
			);
			break;
	}
}

// Target

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
	const baseTarget = baseTargets?.findParameterizedNode('target', name);
	const target = toJsonObject(node, {
		allowArray: false,
		ignoreValues: true,
		ignoreChildren: new Set(['configuration']),
		serializers,
		baseNode: baseTarget,
	});

	if (baseTarget?.children != null) {
		target.configurations = Object.fromEntries(
			baseTarget.findNodesByName('configuration').map(node =>
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
				node.findNodesByName('configuration').map(node =>
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
		Entry.createArgument(name),
		Entry.createProperty('builder', target.builder as string),
	]);

	if (target.defaultConfiguration != null) {
		node.setProperty(
			'defaultConfiguration',
			target.defaultConfiguration as string,
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

function applyChangeToTarget(
	project: Node,
	baseProject: Node | undefined,
	targetName: string,
	path: [string, ...JsonPropertyPath],
	change: Change,
) {
	if (path.length === 2) {
		switch (change.type) {
			case ChangeType.Delete: {
				project.removeNode(
					findNamedChild(project, 'target', targetName, change),
				);
				break;
			}
			case ChangeType.Add: {
				const projectDoc = getDocument(project, true);
				const allTargets = project.findNodesByName('target');
				projectDoc.insertNodeAfter(
					unparseTarget(targetName, change.value as JsonObject),
					allTargets[allTargets.length - 1]!,
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

		return;
	}

	const target = findNamedChild(project, 'target', targetName, change);
	const baseTarget =
		baseProject &&
		findNamedChild(baseProject, 'target', targetName, change, true);
	path = path.slice(2) as [string, ...JsonPropertyPath];

	if (path.length === 1 && path[0] === 'options') {
		if (change.type === ChangeType.Delete) {
			deleteValue(target, 'options');
			return;
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

		return;
	}

	if (path[0] !== 'configurations') {
		applyChangeToJsonObject(target, baseTarget, path, change);
		return;
	}

	if (path.length === 1) {
		if (change.type !== ChangeType.Add) {
			if (target.children != null) {
				target.removeNodesByName('configuration');
				if (!target.hasChildren()) {
					target.children = null;
				}
			}
		}

		if (change.type !== ChangeType.Delete) {
			target.appendNode(
				new Document(
					Object.entries(change.value as JsonObject).map(
						([name, configuration]) =>
							unparseConfiguration(name, configuration as JsonObject),
					),
				),
			);
		}

		return;
	}

	const configurationName = path[1] as string;

	applyChangeToConfiguration(
		target,
		baseTarget,
		configurationName,
		path.slice(2),
		change,
	);
}

// Project

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
	const baseName = node.getProperty('extends');
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
			baseProject.findNodesByName('target').map(node =>
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
				node.findNodesByName('target').map(node =>
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
		Entry.createArgument(name),
		Entry.createProperty('root', project.root as string),
	]);

	for (const key of ['projectType', 'sourceRoot', 'prefix']) {
		if (project[key] != null) {
			node.setProperty(key, project[key] as string);
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

function applyChangeToProject(
	workspace: Document,
	projectName: string,
	path: JsonPropertyPath,
	change: Change,
) {
	if (path.length === 0) {
		switch (change.type) {
			case ChangeType.Delete:
				workspace.removeNode(
					findNamedChild(workspace, 'project', projectName, change),
				);
				break;
			case ChangeType.Add: {
				const allProjects = workspace.findNodesByName('project');
				workspace.insertNodeAfter(
					unparseProject(projectName, change.value as JsonObject),
					allProjects[allProjects.length - 1]!,
				);
				break;
			}
			case ChangeType.Modify:
				replaceNodeInPlace(
					findNamedChild(workspace, 'project', projectName, change),
					unparseProject(projectName, change.value as JsonObject),
				);
				break;
		}

		return;
	}

	const project = findNamedChild(workspace, 'project', projectName, change);
	const baseProject = project.hasProperty('extends')
		? findNamedChild(
				workspace,
				'project',
				project.getProperty('extends') as string,
				change,
		  )
		: undefined;
	if (baseProject && baseProject.getTag() !== 'abstract') {
		throw new Error(
			`Invalid extends in project ${JSON.stringify(
				projectName,
			)}: ${JSON.stringify(
				project.getProperty('extends'),
			)} is not an abstract project`,
		);
	}

	if (path[0] !== 'targets' && path[0] !== 'architect') {
		applyChangeToJsonObject(
			project,
			baseProject,
			path as [string, ...JsonPropertyPath],
			change,
		);
		return;
	}

	if (path.length === 1) {
		if (change.type !== ChangeType.Add) {
			project.removeNodesByName('target');
			if (!project.hasChildren()) {
				project.children = null;
			}
		}

		if (change.type !== ChangeType.Delete) {
			project.appendNode(
				new Document(
					Object.entries(change.value as JsonObject).map(([name, target]) =>
						unparseTarget(name, target as JsonObject),
					),
				),
			);
		}

		return;
	}

	const targetName = path[1] as string;

	applyChangeToTarget(
		project,
		baseProject,
		targetName,
		path.slice(2) as [string, ...JsonPropertyPath],
		change,
	);
}

// Workspace

function parseWorkspace(
	document: Document,
	{serializers}: {serializers?: Map<string, EntrySerializer>} = {},
): JsonObject {
	const workspace: [string, JsonValue][] = [];

	const allProjectNodes = document.findNodesByName('project');

	const abstractProjects = new Map(
		allProjectNodes
			.filter(node => node.getTag() === 'abstract')
			.map(node => [getSingleStringValue(node, `for abstract project`), node]),
	);

	const projects = allProjectNodes
		.filter(node => node.getTag() !== 'abstract')
		.map(node => parseProject(node, {serializers, abstractProjects}));

	for (const node of document.nodes) {
		if (node.getName() === 'project') {
			continue;
		}

		workspace.push([node.getName(), toJsonValue(node, {serializers})]);
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

function applyChangeToWorkspace(
	workspace: Document,
	path: [string, ...JsonPropertyPath],
	change: Change,
) {
	if (change.path[0] !== 'projects') {
		applyChangeToJsonObject(workspace, undefined, path, change);
		return;
	}

	if (path.length === 1) {
		if (change.type !== ChangeType.Add) {
			workspace.removeNodesByName('project');
		}

		if (change.type !== ChangeType.Delete) {
			workspace.appendNode(
				new Document(
					Object.entries(change.value as JsonObject).map(([name, project]) =>
						unparseProject(name, project as JsonObject),
					),
				),
			);
		}

		return;
	}

	const projectName = path[1] as string;
	applyChangeToProject(workspace, projectName, path.slice(2), change);
}

// API

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
			applyChangeToWorkspace(
				document,
				Array.from(change.path) as [string, ...JsonPropertyPath],
				change,
			);
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
