import type {Document, Node} from '@bgotink/kdl';
import {posix} from 'path';

import {InvalidConfigurationError, JsonObject, JsonValue} from '../../types';

import {
	collectParameterizedSubContexts,
	getSingleStringValue,
	namedSubContext,
	ParserContext,
} from './context';
import {toJsonObject, toJsonValue} from './jik/parse';

function parseConfigurations(context: ParserContext) {
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

function parseTargets(context: ParserContext): JsonObject | undefined {
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

export function parseMiniWorkspace(
	document: Document,
	targets: ReadonlyMap<string, string>,
) {
	const usedNodes = new Set<Node>();
	const parsedTargets = Object.fromEntries(
		Array.from(targets, ([targetName, builder]): [string, JsonObject] => {
			const node = document.findNodeByName(targetName);

			if (node == null) {
				return [targetName, {builder}];
			}

			usedNodes.add(node);
			const context = {node, tags: new Map()};

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

			return [targetName, {...target, builder}];
		}),
	);

	const workspace: [string, JsonValue][] = [
		[
			'projects',
			{
				project: {
					root: '.',
					targets: parsedTargets,
				},
			},
		],
	];

	for (const node of document.nodes) {
		const name = node.getName();
		if (usedNodes.has(node) || name === 'version') {
			continue;
		}

		workspace.push([
			name,
			toJsonValue({
				tags: new Map(),
				node,
			}),
		]);
	}

	return Object.fromEntries(workspace);
}
