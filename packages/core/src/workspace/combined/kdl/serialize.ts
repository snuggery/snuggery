import {Document, Entry, Node} from '@bgotink/kdl';

import type {JsonObject} from '../../types';

import {fromJsonObject, fromJsonValue} from './jik/serialize';

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
