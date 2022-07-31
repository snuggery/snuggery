import {Document, Entry, Node} from '@bgotink/kdl';

import {
	isJsonArray,
	isJsonObject,
	type JsonObject,
	type JsonValue,
} from '../../types';

import {isArrayOfPrimitives} from './json-utils';
import {arrayItemKey, implicitPropertyKey} from './kdl-utils';

// JSON

export function fromJsonValue(
	name: string,
	jsonValue: JsonValue,
	{insideArray = false, allowEntries = true} = {},
): Node[] {
	if (isJsonArray(jsonValue)) {
		return fromJsonArray(name, jsonValue, {insideArray});
	} else if (isJsonObject(jsonValue)) {
		return [fromJsonObject(name, jsonValue, {allowEntries})];
	}

	const node = Node.create(name);
	node.addArgument(jsonValue);
	return [node];
}

function fromJsonArray(
	name: string,
	jsonValue: JsonValue[],
	{insideArray = false} = {},
): Node[] {
	if (isArrayOfPrimitives(jsonValue)) {
		const node = Node.create(name);
		node.entries = jsonValue.map(item => Entry.createArgument(item));
		return [node];
	}

	if (!insideArray) {
		return jsonValue.flatMap(item =>
			fromJsonValue(name, item, {insideArray: true}),
		);
	}

	const node = Node.create(name);
	node.children = new Document(
		jsonValue.flatMap(item =>
			fromJsonValue(arrayItemKey, item, {insideArray: true}),
		),
	);
	return [node];
}

export function fromJsonObject(
	name: string,
	jsonValue: JsonObject,
	{allowEntries = true} = {},
): Node {
	const node = Node.create(name);

	const children: Node[][] = [];

	for (const [property, propertyValue] of Object.entries(jsonValue)) {
		if (property === implicitPropertyKey) {
			if (isJsonArray(propertyValue)) {
				if (isArrayOfPrimitives(propertyValue)) {
					node.entries.unshift(
						...propertyValue.map(item => Entry.createArgument(item)),
					);
					continue;
				}
			} else if (!isJsonObject(propertyValue)) {
				node.entries.unshift(Entry.createArgument(propertyValue));
				continue;
			}
		}

		if (
			!allowEntries ||
			isJsonObject(propertyValue) ||
			isJsonArray(propertyValue)
		) {
			children.push(fromJsonValue(property, propertyValue));
		} else {
			node.setProperty(property, propertyValue);
		}
	}

	const flattenedChildren = children.flat();
	if (flattenedChildren.length > 0) {
		node.children = new Document(flattenedChildren);
	}

	return node;
}

// Workspace configuration

export function serializeConfiguration(
	name: string,
	configuration: JsonObject,
): Node {
	const node = fromJsonObject('configuration', configuration, {
		allowEntries: false,
	});

	node.entries.unshift(Entry.createArgument(name));

	return node;
}

export function serializeTarget(name: string, target: JsonObject): Node {
	const node = Node.create('target');
	node.addArgument(name);
	node.setProperty('builder', target.builder as string);

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
						serializeConfiguration(
							configurationName,
							configuration as JsonObject,
						),
				);
			case 'options': {
				const options = fromJsonObject(propertyName, value as JsonObject, {
					allowEntries: false,
				});
				if (!options.entries.length && options.children == null) {
					return [];
				}
				return options;
			}
			default:
				return fromJsonValue(propertyName, value);
		}
	});

	if (children.length > 0) {
		node.children = new Document(children);
	}

	return node;
}

export function serializeProject(name: string, project: JsonObject): Node {
	const node = Node.create('project');
	node.addArgument(name);
	node.setProperty('root', project.root as string);

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
					serializeTarget(targetName, target as JsonObject),
				);
			default:
				return fromJsonValue(propertyName, value);
		}
	});

	if (children.length > 0) {
		node.children = new Document(children);
	}

	return node;
}

export function serializeWorkspace(workspace: JsonObject): Document {
	return new Document(
		Object.entries(workspace).flatMap(([name, value]) => {
			switch (name) {
				case 'projects':
					return Object.entries(value as JsonObject).map(
						([projectName, project]) =>
							serializeProject(projectName, project as JsonObject),
					);
				case 'version':
					return fromJsonValue(name, 0);
				default:
					return fromJsonValue(name, value);
			}
		}),
	);
}
