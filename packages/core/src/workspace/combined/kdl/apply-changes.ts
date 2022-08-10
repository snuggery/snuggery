import {Document, Entry, Identifier, Node} from '@bgotink/kdl';

import {Change, ChangeType} from '../../proxy';
import type {
	JsonObject,
	JsonPropertyName,
	JsonPropertyPath,
	JsonValue,
} from '../../types';

import {
	collectNodes,
	collectParameterizedSubContexts,
	getNode,
	getNodes,
	getSingleStringValue,
	hasNamedSubContext,
	namedSubContext,
	ParserContext,
} from './context';
import {isArrayOfPrimitives, isPrimitive, JsonPrimitive} from './json-utils';
import {
	append,
	arrayItemKey,
	implicitPropertyKey,
	insertAfter,
	insertBefore,
	isChildOf,
	replace,
	setTag,
	tagOverwrite,
} from './kdl-utils';
import {addProjectRelativeTag} from './parse';
import {
	fromJsonObject,
	fromJsonValue,
	serializeConfiguration,
	serializeProject,
	serializeTarget,
} from './serialize';

function processTagEntry(
	context: Pick<ParserContext, 'tags'>,
	entry: Entry,
	value: Exclude<JsonValue, JsonValue[] | JsonObject>,
) {
	const tag = context.tags.get(entry.getTag()!);
	entry.setValue(tag ? tag.fromJson(value) : value);
}

function processTag(
	context: Pick<ParserContext, 'tags'>,
	node: Node,
	name: string,
	value: JsonPrimitive,
): void;
function processTag(
	context: Pick<ParserContext, 'tags'>,
	node: Node,
	name: null,
	value: JsonPrimitive | JsonPrimitive[],
): void;
function processTag(
	context: Pick<ParserContext, 'tags'>,
	node: Node,
	name: string | null,
	value: JsonPrimitive | JsonPrimitive[],
): void {
	if (name != null) {
		const entry = node.getPropertyEntry(name);

		if (entry != null) {
			processTagEntry(context, entry, value as JsonPrimitive);
		} else {
			node.setProperty(name, value as JsonPrimitive);
		}

		return;
	}

	if (!Array.isArray(value)) {
		value = [value];
	}

	const entries = node.getArgumentEntries();

	if (entries.length <= value.length) {
		for (const [i, v] of value.entries()) {
			if (i >= entries.length) {
				node.addArgument(v);
			} else {
				processTagEntry(context, entries[i]!, v);
			}
		}
	} else {
		for (const [i, e] of entries.entries()) {
			if (i >= value.length) {
				node.removeArgument(value.length);
			} else {
				processTagEntry(context, e, value[i]!);
			}
		}
	}
}

// JSON

function _applyChangeToObject(
	context: ParserContext,
	name: string,
	change: Change,
	{allowEntries = true} = {},
) {
	const node = getNode(context)!;

	if (change.type === ChangeType.Delete) {
		if (name !== implicitPropertyKey) {
			node.deleteProperty(name);
			node.removeNodesByName(name);
		} else {
			node.entries = node.getPropertyEntries();
			node.removeNodesByName(arrayItemKey);
		}

		return;
	}

	if (change.type === ChangeType.Add) {
		if (name !== implicitPropertyKey) {
			append(node, fromJsonValue(name, change.value, {allowEntries}));
		} else {
			if (allowEntries && isPrimitive(change.value)) {
				node.addArgument(change.value);
			} else if (allowEntries && isArrayOfPrimitives(change.value)) {
				for (const v of change.value) {
					node.addArgument(v);
				}
			} else {
				append(
					node,
					fromJsonValue(implicitPropertyKey, change.value, {allowEntries}),
				);
			}
		}

		return;
	}

	if (name !== implicitPropertyKey) {
		if (node.hasProperty(name)) {
			if (isPrimitive(change.value)) {
				processTag(context, node, name, change.value);
			} else {
				node.deleteProperty(name);
				append(node, fromJsonValue(name, change.value, {allowEntries}));
			}

			return;
		}
	} else {
		if (node.hasArguments()) {
			if (isPrimitive(change.value) || isArrayOfPrimitives(change.value)) {
				processTag(context, node, null, change.value);
			} else {
				node.entries = node.getPropertyEntries();
				append(node, fromJsonValue(arrayItemKey, change.value, {allowEntries}));
			}

			return;
		}

		name = arrayItemKey;
	}

	const existingNodes = node.findNodesByName(name) as [Node, ...Node[]];
	const newNode = fromJsonValue(name, change.value, {allowEntries});

	if (existingNodes.length === 0 || hasNamedSubContext(context.extends, name)) {
		// value came from parent
		setTag(tagOverwrite, newNode);
	}

	insertBefore(node, newNode, existingNodes[0]);

	const nodesToDelete = new Set(existingNodes);
	node.children!.nodes = node.children!.nodes.filter(
		n => !nodesToDelete.has(n),
	);
}

function _applyChangeToArray(
	context: ParserContext,
	name: string,
	index: number,
	change: Change,
) {
	const location = getNode(context)!;
	const namedContext = namedSubContext(context, name)!;
	const nodes = collectNodes(namedContext);

	if (nodes.length === 1) {
		// Must be an array of primitives

		const node = nodes[0]!;

		if (change.type === ChangeType.Delete) {
			node.removeArgument(index);
			return;
		}

		if (isPrimitive(change.value)) {
			const entry = node.getArgumentEntry(index);
			if (change.type === ChangeType.Modify) {
				processTagEntry(context, entry!, change.value);
			} else if (entry) {
				node.entries = node.entries.flatMap(e =>
					e === entry
						? [Entry.createArgument(change.value as JsonPrimitive), entry]
						: e,
				);
			} else {
				node.addArgument(change.value);
			}
			return;
		}

		// Adding a non-primitive to our array of primitives
		const newNodes = node
			.getArgumentEntries()
			.map(entry => new Node(new Identifier(name), [entry])) as (
			| Node
			| Node[]
		)[];

		if (change.type === ChangeType.Modify) {
			newNodes[index] = fromJsonValue(name, change.value, {insideArray: true});
		} else {
			newNodes.splice(
				index,
				0,
				fromJsonValue(name, change.value, {insideArray: true}),
			);
		}

		const flattened = newNodes.flat();

		flattened[0]!.leading = node.leading;
		flattened[flattened.length - 1]!.trailing = node.trailing;

		replace(location, node, flattened);
		return;
	}

	// First try to apply changes without having to copy over the entire array

	if (change.type === ChangeType.Add) {
		if (getNodes(namedContext).length === nodes.length) {
			// All items of the array are in the node, so... yay
			insertBefore(
				location,
				fromJsonValue(name, change.value, {insideArray: true}),
				nodes[index]!,
			);
			return;
		}

		if (index === 0) {
			insertBefore(
				location,
				setTag(
					'prepend',
					fromJsonValue(name, change.value, {insideArray: true}),
				),
				nodes[0] || null,
			);
			return;
		}

		if (index === nodes.length) {
			insertAfter(
				location,
				setTag(
					'append',
					fromJsonValue(name, change.value, {insideArray: true}),
				),
				nodes[nodes.length - 1] || null,
			);
			return;
		}
	} else {
		const node = nodes[index]!;

		if (isChildOf(location, node)) {
			if (change.type === ChangeType.Delete) {
				location.removeNode(node);
			} else {
				replace(
					location,
					node,
					setTag(
						node.getTag(),
						fromJsonValue(name, change.value, {insideArray: true}),
					),
				);
			}
			return;
		}
	}

	// Alas, clone the entire array

	const ownNodes = setTag(
		null,
		nodes.map(node => (isChildOf(location, node) ? node : node.clone())),
	);

	{
		const firstOwnNode = nodes.find(node => isChildOf(location, node)) ?? null;
		const nodesToRemove = new Set(nodes);

		location.children!.nodes = location.children!.nodes.flatMap(child => {
			if (child === firstOwnNode) {
				return ownNodes;
			} else if (nodesToRemove.has(child)) {
				return [];
			} else {
				return child;
			}
		});
	}

	switch (change.type) {
		case ChangeType.Delete:
			location.removeNode(ownNodes[index]!);
			break;
		case ChangeType.Add:
			insertBefore(
				location,
				fromJsonValue(name, change.value, {insideArray: true}),
				ownNodes[index] || null,
			);
			break;
		case ChangeType.Modify:
			replace(
				location,
				ownNodes[index]!,
				fromJsonValue(name, change.value, {insideArray: true}),
			);
			break;
	}
}

function applyChangeToJsonValue(
	context: ParserContext,
	name: string,
	path: JsonPropertyPath,
	change: Change,
	{allowEntries = true} = {},
) {
	if (path.length === 0) {
		return _applyChangeToObject(context, name, change, {allowEntries});
	}

	let [next, ...restOfPath] = path as [JsonPropertyName, ...JsonPropertyPath];
	let location = getNode(context)!;
	let nextContext = namedSubContext(context, name)!;
	let nodes = collectNodes(nextContext);

	while (typeof next === 'number') {
		if (restOfPath.length === 0) {
			return _applyChangeToArray(context, name, next, change);
		}

		const node = nodes[next]!;

		if (!location.children!.nodes.includes(node)) {
			const ownNodes = new Set(location.children!.nodes);
			const clones = setTag(
				null,
				nodes.map(n => (ownNodes.has(n) ? n : n.clone())),
			);
			const firstOwnNode = clones.find(n => ownNodes.has(n));

			location.children!.nodes = location.children!.nodes.flatMap(n => {
				if (n === firstOwnNode) {
					return clones;
				}

				return ownNodes.has(n) ? [] : n;
			});

			nodes = clones;
		}

		location = node;
		[next, ...restOfPath] = path as [JsonPropertyName, ...JsonPropertyPath];
		nextContext = {
			tags: nextContext.tags,
			node,
		};

		if (typeof next === 'number') {
			name = arrayItemKey;
		}
	}

	applyChangeToJsonValue(nextContext, next, restOfPath, change);
}

// Helpers

function applyChangeToNamedMap(
	context:
		| (ParserContext & {node: Node})
		| (Omit<ParserContext, 'node' | 'location'> & {node: Document}),
	nodeName: string,
	change: Change,
) {
	if (change.type === ChangeType.Delete) {
		context.node.removeNodesByName(nodeName);
		return;
	}

	const nodes = Object.entries(change.value as Record<string, JsonObject>).map(
		([name, value]) => {
			const node = fromJsonObject(nodeName, value, {
				allowEntries: false,
			});
			node.entries.unshift(Entry.createArgument(name));
			return node;
		},
	);

	if (change.type === ChangeType.Add) {
		append(context.node, nodes);
		return;
	}

	const existingNodes = new Set(
		collectParameterizedSubContexts(context, nodeName).keys(),
	);
	for (const node of nodes) {
		if (!existingNodes.has(node.getArgument(0) as string)) {
			node.setTag(tagOverwrite);
		}
	}
	const firstExistingNode = context.node.findNodeByName(nodeName);
	const document =
		context.node instanceof Document
			? context.node
			: context.node.children ?? (context.node.children = new Document());

	let added = false;

	document.nodes = document.nodes.flatMap(n => {
		if (n === firstExistingNode) {
			added = true;
			return nodes;
		}

		return n.getName() === nodeName ? [] : n;
	});

	if (!added) {
		append(document, nodes);
	}
}

// Workspace configuration

function applyChangeToConfigurations(
	context: ParserContext & {node: Node},
	path: JsonPropertyPath,
	change: Change,
) {
	if (path.length === 0) {
		applyChangeToNamedMap(context, 'configuration', change);
		return;
	}

	let name: string;
	// eslint-disable-next-line prefer-const
	[name, ...path] = path as [string, ...JsonPropertyPath];
	const location = getNode(context)!;

	const configuration = collectParameterizedSubContexts(
		context,
		'configuration',
	).get(name);

	if (path.length === 0) {
		if (change.type === ChangeType.Delete) {
			location.removeNode(configuration!.node);
			return;
		}

		const newConfiguration = serializeConfiguration(
			name,
			change.value as JsonObject,
		);

		if (change.type === ChangeType.Add) {
			location.appendNode(newConfiguration);
		} else if (!configuration) {
			append(location, newConfiguration);
		} else if (!isChildOf(location, configuration.node)) {
			append(location, setTag(tagOverwrite, [newConfiguration]));
		} else if (configuration.extends != null) {
			replace(
				location,
				configuration.node,
				setTag(tagOverwrite, [newConfiguration]),
			);
		} else {
			replace(location, configuration.node, newConfiguration);
		}

		return;
	}

	return applyChangeToJsonValue(
		configuration!,
		path[0] as string,
		path.slice(1),
		change,
		{allowEntries: false},
	);
}

function applyChangeToTargets(
	context: ParserContext & {node: Node},
	path: JsonPropertyPath,
	change: Change,
): void {
	if (path.length === 0) {
		applyChangeToNamedMap(context, 'target', change);
		return;
	}

	let name: string;
	[name, ...path] = path as [string, ...JsonPropertyPath];

	const target = collectParameterizedSubContexts(context, 'target').get(name);

	if (path.length === 0) {
		if (change.type === ChangeType.Delete) {
			context.node.removeNode(target!.node);
			return;
		}

		const newTarget = serializeTarget(name, change.value as JsonObject);

		if (change.type === ChangeType.Add) {
			context.node.appendNode(newTarget);
		} else if (!target) {
			append(context.node, newTarget);
		} else if (!isChildOf(context.node, target.node)) {
			append(context.node, setTag(tagOverwrite, [newTarget]));
		} else if (target.extends != null) {
			replace(context.node, target.node, setTag(tagOverwrite, [newTarget]));
		} else {
			replace(context.node, target.node, newTarget);
		}
		return;
	}

	[name, ...path] = path as [string, ...JsonPropertyPath];

	if (name === 'configurations') {
		applyChangeToConfigurations(target!, path, change);
	} else {
		applyChangeToJsonValue(target!, name, path, change, {
			allowEntries: name !== 'options',
		});
	}
}

function applyChangeToProjects(
	document: Document,
	expandedDocument: Document,
	allDocuments: readonly Document[],
	path: JsonPropertyPath,
	change: Change,
): void {
	if (path.length === 0) {
		// Remove all projects from imported documents,
		// Then apply the change to the main document
		for (const doc of allDocuments) {
			if (doc !== document) {
				doc.removeNodesByName('project');
			}
		}

		applyChangeToNamedMap(
			{
				tags: new Map(),
				node: document,
			},
			'project',
			change,
		);
		return;
	}

	let name: string;
	[name, ...path] = path as [string, ...JsonPropertyPath];

	const projects = collectParameterizedSubContexts(
		{
			tags: new Map(),
			node: expandedDocument,
		},
		'project',
	);
	let project = projects.get(name);

	if (project) {
		project = addProjectRelativeTag(
			{
				...project,
				extends: project.node.hasProperty('extends')
					? projects.get(project.node.getProperty('extends') as string)
					: undefined,
			},
			getSingleStringValue(project, 'root'),
		);
	}

	if (path.length === 0) {
		const ownerDocument =
			project && allDocuments.find(doc => doc.nodes.includes(project!.node))!;

		if (change.type === ChangeType.Delete) {
			ownerDocument!.removeNode(project!.node);
			return;
		}

		const newProject = serializeProject(name, change.value as JsonObject);

		if (change.type === ChangeType.Add) {
			document.appendNode(newProject);
		} else if (!project) {
			append(document, newProject);
		} else if (!isChildOf(ownerDocument!, project.node)) {
			append(ownerDocument!, newProject);
		} else {
			replace(ownerDocument!, project.node, newProject);
		}
		return;
	}

	[name, ...path] = path as [string, ...JsonPropertyPath];

	if (name === 'targets') {
		applyChangeToTargets(project!, path, change);
	} else {
		applyChangeToJsonValue(project!, name, path, change, {
			allowEntries: name !== 'cli',
		});
	}
}

export function applyChangeToWorkspace(
	document: Document,
	expandedDocument: Document,
	allDocuments: readonly Document[],
	change: Change,
): void {
	const [name, ...path] = change.path.slice() as [string, ...JsonPropertyPath];

	if (name === 'version') {
		return;
	}

	if (name === 'projects') {
		return applyChangeToProjects(
			document,
			expandedDocument,
			allDocuments,
			path,
			change,
		);
	}

	if (path.length > 0) {
		return applyChangeToJsonValue(
			{
				tags: new Map(),
				node: expandedDocument.findNodeByName(name)!,
			},
			path[0] as string,
			path.slice(1),
			change,
			{allowEntries: false},
		);
	}

	// applyChangeToJsonValue requires a node, which we can't provide here

	if (change.type === ChangeType.Add) {
		// Add to the main document
		append(
			document,
			fromJsonValue(name, change.value, {
				allowEntries: false,
				insideArray: true,
			}),
		);
		return;
	}

	const node = expandedDocument.findNodeByName(name)!;
	const ownerDocument = allDocuments.find(doc => doc.nodes.includes(node))!;

	if (change.type === ChangeType.Delete) {
		ownerDocument.removeNode(node);
		return;
	}

	const newNode = fromJsonValue(name, change.value, {
		allowEntries: false,
		insideArray: true,
	});

	ownerDocument.replaceNode(node, new Document(newNode));
}
