import type {JsonArray} from '@angular-devkit/core';
import {Document, Entry, Identifier, Node, Value} from '@bgotink/kdl';

import {
	isJsonArray,
	isJsonObject,
	JsonObject,
	JsonPropertyPath,
	JsonValue,
	stringifyPath,
} from '../../types';

import {
	getDocument,
	isProperty,
	isValue,
	replaceNodeInPlace,
} from './kdl-utils';

export const implicitKeyForValue = '$implicit';
export const arrayItemKey = '-';

function isArrayOfPrimitive(
	value: JsonValue[],
): value is Exclude<JsonValue, JsonObject | JsonValue[]>[];
function isArrayOfPrimitive(
	value: readonly JsonValue[],
): value is readonly Exclude<JsonValue, JsonObject | JsonValue[]>[];
function isArrayOfPrimitive(
	value: readonly JsonValue[],
): value is readonly Exclude<JsonValue, JsonObject | JsonValue[]>[] {
	return !value.some(item => isJsonArray(item) || isJsonObject(item));
}

export function findArrayItems(
	nodeOrDocument: Node | Document,
	name: string,
):
	| {nodes: [Node, ...Node[]]; document: Document}
	| {entries: Entry[]; node: Node; document: Document}
	| null {
	const document = getDocument(nodeOrDocument);
	if (document == null) {
		return null;
	}

	const nodes = document.nodes.filter(node => node.name.name === name);

	if (nodes.length === 0) {
		return null;
	}

	if (nodes.length > 1) {
		return {nodes: nodes as [Node, ...Node[]], document};
	}

	const child = nodes[0]!;
	const itemChildren = child.children?.nodes.filter(
		node => node.name.name === arrayItemKey,
	);
	if (itemChildren?.length) {
		return {
			nodes: itemChildren as [Node, ...Node[]],
			document: child.children!,
		};
	}

	return {
		entries: child.entries.filter(isValue),
		node: child,
		document,
	};
}

export function toJsonValue(node: Node): JsonValue {
	if (node.children != null || node.entries.some(isProperty)) {
		return toJsonObject(node);
	}

	switch (node.entries.length) {
		case 0:
			// TODO: make this true, like a flag?
			// options { watch; coverage; }
			return null;
		case 1:
			return node.entries[0]!.value.value;
		default:
			return node.entries.map(entry => entry.value.value);
	}
}

export function toJsonObject(
	node: Node,
	options?: {
		ignoreEntries?: boolean;
		ignoreValues?: boolean;
		ignoreChildren?: Set<string>;
		allowArray?: true;
	},
): JsonObject | JsonArray;
export function toJsonObject(
	node: Node,
	options: {
		ignoreEntries?: boolean;
		ignoreValues?: boolean;
		ignoreChildren?: Set<string>;
		allowArray: false;
	},
): JsonObject;
export function toJsonObject(
	node: Node,
	{
		ignoreEntries = false,
		ignoreValues = false,
		ignoreChildren = new Set<string>(),
		allowArray = true,
	} = {},
): JsonObject | JsonArray {
	const implicitValues: Value['value'][] = [];
	const result = new Map<string, JsonValue>();

	if (!ignoreEntries) {
		for (const {name, value} of node.entries) {
			if (name == null) {
				implicitValues.push(value.value);
			} else {
				result.set(name.name, value.value);
			}
		}
	}

	if (!ignoreValues && implicitValues.length > 0) {
		result.set(implicitKeyForValue, implicitValues);
	}

	if (node.children != null) {
		const childValues = new Map<string, JsonValue[]>();

		for (const child of node.children.nodes) {
			if (ignoreChildren.has(child.name.name)) {
				continue;
			}

			let values = childValues.get(child.name.name);
			if (values == null) {
				values = [];
				childValues.set(child.name.name, values);
			}

			values.push(toJsonValue(child));
		}

		if (childValues.get(arrayItemKey) != null) {
			const values = childValues.get(arrayItemKey)!;

			if (!allowArray || childValues.size > 1 || result.size > 0) {
				result.set(implicitKeyForValue, values);
				childValues.delete(arrayItemKey);
			} else {
				return values;
			}
		}

		for (const [name, values] of childValues) {
			if (values.length === 1) {
				result.set(name, values[0]!);
			} else {
				result.set(name, values);
			}
		}
	}

	return Object.fromEntries(result);
}

export function fromJsonValue(
	value: JsonValue,
	name: string,
	options: {allowDocument: true},
): Node | Document;
export function fromJsonValue(
	value: JsonValue,
	name: string,
	options?: {allowDocument?: false},
): Node;
export function fromJsonValue(
	value: JsonValue,
	name: string,
	{allowDocument = false} = {},
): Node | Document {
	if (isJsonArray(value)) {
		if (isArrayOfPrimitive(value)) {
			return new Node(
				new Identifier(name),
				value.map(item => new Entry(new Value(item), null)),
			);
		}

		if (allowDocument) {
			return new Document(value.map(item => fromJsonValue(item, name)));
		}

		return new Node(
			new Identifier(name),
			undefined,
			new Document(value.map(item => fromJsonValue(item, arrayItemKey))),
		);
	}

	if (isJsonObject(value)) {
		return fromJsonObject(value, name);
	}

	return new Node(new Identifier(name), [new Entry(new Value(value), null)]);
}

export function fromJsonObject(
	object: JsonObject,
	nodeName: string,
	{ignoreEntries = false} = {},
): Node {
	const node = new Node(new Identifier(nodeName));
	const children: Node[] = [];

	for (const [name, value] of Object.entries(object)) {
		if (!ignoreEntries) {
			if (name === implicitKeyForValue && isJsonArray(value)) {
				if (isArrayOfPrimitive(value)) {
					node.entries.push(
						...value.map(item => new Entry(new Value(item), null)),
					);
					continue;
				}
			}

			if (!isJsonObject(value) && !isJsonArray(value)) {
				node.entries.push(
					new Entry(
						new Value(value),
						name === implicitKeyForValue ? null : new Identifier(name),
					),
				);
				continue;
			}
		}

		const nodeOrDocument = fromJsonValue(value, name, {allowDocument: true});
		if (nodeOrDocument instanceof Node) {
			children.push(nodeOrDocument);
		} else {
			children.push(...nodeOrDocument.nodes);
		}
	}

	if (children.length) {
		node.children = new Document(children);
	}

	return node;
}

export function deleteValue(nodeOrDocument: Node | Document, name: string) {
	const document = getDocument(nodeOrDocument);
	if (document != null) {
		document.nodes = document.nodes.filter(node => node.name.name !== name);
	}

	if (nodeOrDocument instanceof Node) {
		nodeOrDocument.entries = nodeOrDocument.entries.filter(
			entry => entry.name?.name !== name,
		);
	}
}

export function deleteEntry(
	path: JsonPropertyPath,
	nodeOrDocument: Node | Document,
	name: string,
	index: number,
) {
	const items = findArrayItems(nodeOrDocument, name);

	if (items == null) {
		throw new Error(`Failed to find ${stringifyPath(path)} to delete`);
	}

	if ('entries' in items) {
		const {entries, node} = items;

		if (index >= entries.length) {
			throw new Error(`Failed to find ${stringifyPath(path)} to delete`);
		}

		node.entries.splice(node.entries.indexOf(entries[index]!), 1);
		return;
	}

	const {nodes, document} = items;

	if (index >= nodes.length) {
		throw new Error(`Failed to find ${stringifyPath(path)} to delete`);
	}

	document.nodes.splice(document.nodes.indexOf(nodes[index]!), 1);
}

export function addValue(
	path: JsonPropertyPath,
	nodeOrDocument: Node | Document,
	name: string,
	value: JsonValue,
	{tryEntry = true} = {},
) {
	if (nodeOrDocument instanceof Node) {
		if (
			nodeOrDocument.entries.some(entry => entry.name?.name === name) ||
			nodeOrDocument.children?.nodes.some(child => child.name.name === name)
		) {
			throw new Error(`Didn't expect ${stringifyPath(path)} to already exist`);
		}

		if (tryEntry && (value == null || typeof value !== 'object')) {
			nodeOrDocument.entries.push(
				new Entry(new Value(value), new Identifier(name)),
			);
		}
	}

	// We must add a child node

	const document = getDocument(nodeOrDocument, true);

	const newNodeOrDocument = fromJsonValue(value, name, {allowDocument: true});
	if (newNodeOrDocument instanceof Node) {
		document.nodes.push(newNodeOrDocument);
	} else {
		document.nodes.push(...newNodeOrDocument.nodes);
	}
}

export function addEntry(
	path: JsonPropertyPath,
	nodeOrDocument: Node | Document,
	name: string,
	value: JsonValue,
) {
	const items = findArrayItems(nodeOrDocument, name);

	if (items == null) {
		throw new Error(`Failed to find ${stringifyPath(path)} to modify`);
	}

	if ('nodes' in items) {
		const {nodes, document} = items;

		document.nodes.splice(
			document.nodes.indexOf(nodes[nodes.length - 1]!) + 1,
			0,
			fromJsonValue(value, nodes[0].name.name),
		);
		return;
	}

	const {entries, node, document} = items;

	if (value == null || typeof value !== 'object') {
		node.entries.splice(
			node.entries.indexOf(entries[entries.length - 1]!) + 1,
			0,
			new Entry(new Value(value), null),
		);
		return;
	}

	// We're adding an object to an array... split the entries into children
	// instead

	if (entries.length === node.entries.length) {
		document.nodes.splice(
			document.nodes.indexOf(node),
			1,
			...entries.map(entry => new Node(new Identifier(name), [entry])),
			fromJsonValue(value, name),
		);
	}

	// This node has properties, so turn entries into children with `-`

	node.entries = node.entries.filter(isProperty);
	getDocument(node, true).nodes.push(
		...entries.map(entry => new Node(new Identifier(arrayItemKey), [entry])),
		fromJsonValue(value, arrayItemKey),
	);
}

export function modifyValue(
	path: JsonPropertyPath,
	nodeOrDocument: Node | Document,
	name: string,
	value: JsonValue,
) {
	if (nodeOrDocument instanceof Node) {
		const matchingEntryIndex = nodeOrDocument.entries.findIndex(
			entry => entry.name?.name === name,
		);

		if (matchingEntryIndex !== -1) {
			if (value == null || typeof value !== 'object') {
				const matchingEntry = nodeOrDocument.entries[matchingEntryIndex]!;
				matchingEntry.value = new Value(value);
				matchingEntry.tag = null;
				return;
			}

			// We have to move from a property to a child node, so remove the property
			nodeOrDocument.entries.splice(matchingEntryIndex, 1);

			const newChild = fromJsonValue(value, name);
			getDocument(nodeOrDocument, true).nodes.push(newChild);
		}
	}

	const existingChild = getDocument(nodeOrDocument)?.nodes.find(
		child => child.name.name === name,
	);

	if (existingChild == null) {
		throw new Error(`Expected to find ${stringifyPath(path)} to modify`);
	}

	replaceNodeInPlace(existingChild, fromJsonValue(value, name));
}

export function modifyEntry(
	path: JsonPropertyPath,
	nodeOrDocument: Node | Document,
	index: number,
	name: string,
	value: JsonValue,
) {
	const items = findArrayItems(nodeOrDocument, name);

	if (items == null) {
		throw new Error(`Failed to find ${stringifyPath(path)} to modify`);
	}

	if ('nodes' in items) {
		const {nodes} = items;

		if (index >= nodes.length) {
			throw new Error(`Failed to find ${stringifyPath(path)} to modify`);
		}

		replaceNodeInPlace(nodes[index]!, fromJsonValue(value, name));
		return;
	}

	const {node, entries, document} = items;

	if (index >= entries.length) {
		throw new Error(`Failed to find ${stringifyPath(path)} to modify`);
	}

	if (value == null || typeof value !== 'object') {
		entries[index]!.tag = null;
		entries[index]!.value = new Value(value);
		return;
	}

	// We're adding an object to an array... split the entries into children
	// instead

	if (entries.length === node.entries.length) {
		document.nodes.splice(
			document.nodes.indexOf(node),
			1,
			...entries.map((v, i) =>
				i === index
					? fromJsonValue(value, name)
					: new Node(new Identifier(name), [v]),
			),
		);
	}

	// This node has properties, so turn entries into children with `-`

	node.entries = node.entries.filter(isProperty);
	getDocument(node, true).nodes.push(
		...entries.map((entry, i) =>
			i === index
				? fromJsonValue(value, arrayItemKey)
				: new Node(new Identifier(arrayItemKey), [entry]),
		),
	);
}
