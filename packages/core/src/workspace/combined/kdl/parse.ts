import type {JsonObject} from '@angular-devkit/core';
import type {Document, Entry, Node} from '@bgotink/kdl';
import {posix} from 'path';

import {InvalidConfigurationError, JsonValue} from '../../types';

import {
	collectNodes,
	collectParameterizedSubContexts,
	getSingleStringValue,
	namedSubContext,
	ParserContext,
} from './context';
import {arrayItemKey, implicitPropertyKey, tagOverwrite} from './kdl-utils';
import {unpackSingleValue} from './utils';

// JSON

function processTag(
	context: Pick<ParserContext, 'tags'>,
	value: Entry[],
): JsonValue[];
function processTag(
	context: Pick<ParserContext, 'tags'>,
	value: Entry | Entry[],
): JsonValue;
function processTag(
	context: Pick<ParserContext, 'tags'>,
	value: Entry | Entry[],
): JsonValue {
	if (Array.isArray(value)) {
		return value.map(v => processTag(context, v));
	}

	const tag = context.tags.get(value.getTag()!);
	return tag ? tag.toJson(value.getValue()) : value.getValue();
}

function _toJsonValue(context: ParserContext, nodes: Node[]): JsonValue {
	if (nodes.length > 1) {
		return _toJsonArray(context, nodes);
	}

	const [node] = nodes as [Node];

	if (node.hasProperties()) {
		return _toJsonObject(context, node);
	}

	if (node.hasChildren()) {
		if (node.children!.nodes.every(node => node.getName() === arrayItemKey)) {
			return _toJsonArray(context, node.children!.nodes);
		}

		return _toJsonObject(context, node);
	}

	// A primitive, so no need to look at the `extends`

	const value = node.getArgumentEntries();
	return processTag(context, unpackSingleValue(value));
}

function _toJsonArray(context: ParserContext, nodes: Node[]): JsonValue[] {
	return nodes.map(node =>
		_toJsonValue({...context, node, extends: undefined}, [node]),
	);
}

function _toJsonObject(
	context: ParserContext,
	node: Node,
	{
		ignoreArguments = false,
		ignoreProperties = false,
		ignoreChildren,
	}: {
		ignoreArguments?: boolean;
		ignoreProperties?: boolean | Set<string>;
		ignoreChildren?: Set<string>;
	} = {},
): JsonObject {
	const extendedProperties = new Map(
		context.extends && node.getTag() !== tagOverwrite
			? Object.entries(
					toJsonObject(context.extends, {
						ignoreArguments,
						ignoreChildren,
						ignoreProperties,
					}),
			  )
			: undefined,
	);
	const ownProperties = new Map<string, JsonValue>();

	if (!ignoreArguments && node.hasArguments()) {
		const args = node.getArgumentEntries();
		ownProperties.set(
			implicitPropertyKey,
			processTag(context, args.length > 1 ? args : args[0]!),
		);
	}

	if (ignoreProperties !== true) {
		const ignoredProperties = new Set(ignoreProperties || []);

		for (const entry of node.getPropertyEntries()) {
			const name = entry.getName()!;
			if (!ignoredProperties.has(name)) {
				ownProperties.set(name, processTag(context, entry));
			}
		}
	}

	if (node.children == null || !node.hasChildren()) {
		return Object.fromEntries([...extendedProperties, ...ownProperties]);
	}

	const childNames = new Set<string>(
		node.children.nodes
			.map(child => child.getName())
			.filter(name => !ignoreChildren?.has(name)),
	);

	for (const name of childNames) {
		const value = toJsonValue({
			...context,
			node: unpackSingleValue(node.findNodesByName(name)),
			extends: namedSubContext(context.extends, name),
		});

		ownProperties.set(
			name === arrayItemKey ? implicitPropertyKey : name,
			value,
		);
	}

	return Object.fromEntries([...extendedProperties, ...ownProperties]);
}

export function toJsonValue(context: ParserContext): JsonValue {
	return _toJsonValue(context, collectNodes(context));
}

export function toJsonObject(
	context: ParserContext,
	options?: {
		ignoreArguments?: boolean;
		ignoreProperties?: boolean | Set<string>;
		ignoreChildren?: Set<string>;
	},
): JsonObject {
	const nodes = collectNodes(context);

	if (nodes.length !== 1) {
		return {};
	}

	return _toJsonObject(context, nodes[0]!, options);
}

// Workspace configuration

function parseConfigurations(context: ParserContext & {node: Node}) {
	const configurations = collectParameterizedSubContexts(
		context,
		'configuration',
	);

	if (configurations.size === 0) {
		return undefined;
	}

	return Object.fromEntries(
		Array.from(configurations, ([name, context]) => [
			name,
			toJsonObject(context, {
				ignoreArguments: true,
			}),
		]),
	);
}

function parseTargets(
	context: ParserContext & {node: Node},
): JsonObject | undefined {
	const targets = collectParameterizedSubContexts(context, 'target');

	if (targets.size === 0) {
		return undefined;
	}

	return Object.fromEntries(
		Array.from(targets, ([name, context]) => {
			const target = toJsonObject(context, {
				ignoreArguments: true,
				ignoreProperties: new Set([
					'configuration',
					'configurations',
					'options',
				]),
				ignoreChildren: new Set(['configuration', 'configurations']),
			});

			const configurations = parseConfigurations(context);
			if (configurations) {
				target.configurations = configurations;
			}

			return [name, target];
		}),
	);
}

export function addProjectRelativeTag<T extends ParserContext>(
	context: T,
	root: string,
): T {
	return {
		...context,

		extends: context.extends && addProjectRelativeTag(context.extends, root),
		tags: new Map([
			...context.tags,
			[
				'project-relative',
				{
					toJson(value) {
						if (typeof value !== 'string') {
							throw new InvalidConfigurationError(
								`The (project-relative) tag only supports string values`,
							);
						}

						return posix.join(root, value);
					},
					fromJson(value) {
						if (typeof value !== 'string') {
							throw new InvalidConfigurationError(
								`The (project-relative) tag only supports string values`,
							);
						}

						return posix.relative(root, value);
					},
				},
			],
		]),
	};
}

function parseProjects(document: Document): JsonObject | undefined {
	const projectContexts = collectParameterizedSubContexts(
		{
			tags: new Map(),
			node: document,
		},
		'project',
	);

	function getExtendedContext(
		name: string,
		cycleDetection: string[],
	): ParserContext {
		if (cycleDetection.includes(name)) {
			throw new InvalidConfigurationError(
				`Loop in project extensions: ${[...cycleDetection, name]
					.map(name => JSON.stringify(name))
					.join(' -> ')}`,
			);
		}
		cycleDetection.push(name);

		const context = projectContexts.get(name);

		if (context == null) {
			throw new InvalidConfigurationError(
				`Couldn't find project ${JSON.stringify(
					name,
				)} to extend in project ${cycleDetection
					.map(name => JSON.stringify(name))
					.join(' -> ')}`,
			);
		}

		const extendsName = context.node.getProperty('extends');

		if (extendsName == null) {
			return context;
		}

		if (typeof extendsName !== 'string') {
			throw new InvalidConfigurationError(
				`Project ${JSON.stringify(
					name,
				)} defines a non-string "extends": ${JSON.stringify(extendsName)}`,
			);
		}

		return {
			...context,
			extends: getExtendedContext(extendsName, [...cycleDetection, name]),
		};
	}

	const concreteProjects = Array.from(projectContexts).filter(
		([, project]) => project.node.getTag() !== 'abstract',
	);

	if (concreteProjects.length === 0) {
		return undefined;
	}

	return Object.fromEntries(
		concreteProjects.map(([name, shallowProjectContext]) => {
			const extendsName = shallowProjectContext.node.getProperty('extends');
			if (extendsName != null && typeof extendsName !== 'string') {
				throw new InvalidConfigurationError(
					`Project ${JSON.stringify(
						name,
					)} defines a non-string "extends": ${JSON.stringify(extendsName)}`,
				);
			}

			let projectContext = shallowProjectContext;
			if (extendsName != null) {
				projectContext = {
					...shallowProjectContext,
					extends: getExtendedContext(extendsName, [name]),
				};
			}

			const root =
				shallowProjectContext.node.getProperty('root') ??
				getSingleStringValue(
					namedSubContext(projectContext, 'root'),
					`root in project ${JSON.stringify(name)}`,
				);

			if (typeof root !== 'string') {
				throw new InvalidConfigurationError(
					`Project ${JSON.stringify(
						name,
					)} doesn't define a string value for "root"`,
				);
			}

			projectContext = addProjectRelativeTag(projectContext, root);

			const project = toJsonObject(projectContext, {
				ignoreArguments: true,
				ignoreChildren: new Set(['target', 'targets']),
				ignoreProperties: new Set(['extends']),
			});

			const targets = parseTargets(projectContext);
			if (targets != null) {
				project.targets = targets;
			}

			return [name, project];
		}),
	);
}

export function parseWorkspace(document: Document): JsonObject {
	const workspace: [string, JsonValue][] = [];

	for (const node of document.nodes) {
		const name = node.getName();
		if (name === 'version') {
			workspace.push([name, 1]);
		} else if (name !== 'project') {
			workspace.push([
				name,
				toJsonValue({
					tags: new Map(),
					node,
				}),
			]);
		}
	}

	const projects = parseProjects(document);
	if (projects != null) {
		workspace.push(['projects', projects]);
	}

	return Object.fromEntries(workspace);
}
