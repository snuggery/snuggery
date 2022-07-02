// cspell:ignore serializers

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

export interface EntrySerializer {
	deserialize(entry: Entry): JsonValue;
	serialize(entry: Entry, value: JsonValue): boolean;
}

function deserialize(
	serializers: Map<string, EntrySerializer> | undefined,
	entry: Entry,
) {
	const serializer = serializers?.get(entry.tag?.name as string);
	return serializer ? serializer.deserialize(entry) : entry.value.value;
}

function updateEntry(
	serializers: Map<string, EntrySerializer> | undefined,
	entry: Entry,
	value: JsonValue,
) {
	const serializer = serializers?.get(entry.tag?.name as string);

	if (serializer) {
		return serializer.serialize(entry, value);
	}

	if (isJsonObject(value) || isJsonArray(value)) {
		return false;
	}

	if (entry.value.value !== value) {
		entry.value = new Value(value);
	}
	return true;
}

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

export function toJsonValue(
	node: Node,
	{
		serializers,
		baseNode,
	}: {serializers?: Map<string, EntrySerializer>; baseNode?: Node} = {},
): JsonValue {
	if (node.children != null || node.entries.some(isProperty)) {
		return toJsonObject(node, {
			serializers,
			baseNode,
		});
	}

	const values = node.entries.map(entry => deserialize(serializers, entry));
	if (values.length === 0) {
		// TODO: make this true, like a flag?
		// options { watch; coverage; }
		return null;
	}

	const baseValue = baseNode && toJsonValue(baseNode, {serializers});

	if (node.tag != null && isJsonArray(baseValue)) {
		switch (node.tag.name) {
			case 'append':
				return [...baseValue, ...values];
			case 'prepend':
				return [...values, ...baseValue];
		}
	}

	return values.length === 1 ? values[0]! : values;
}

export function toJsonObject(
	node: Node,
	options: {
		ignoreEntries?: boolean | Set<string>;
		ignoreValues?: boolean;
		ignoreChildren?: Set<string>;
		allowArray: false;
		serializers?: Map<string, EntrySerializer>;
		baseNode?: Node;
	},
): JsonObject;
export function toJsonObject(
	node: Node,
	options?: {
		ignoreEntries?: boolean | Set<string>;
		ignoreValues?: boolean;
		ignoreChildren?: Set<string>;
		allowArray?: boolean;
		serializers?: Map<string, EntrySerializer>;
		baseNode?: Node;
	},
): JsonObject | JsonArray;
export function toJsonObject(
	node: Node,
	{
		ignoreEntries = false,
		ignoreValues = false,
		ignoreChildren = new Set<string>(),
		allowArray = true,
		serializers,
		baseNode,
	}: {
		ignoreEntries?: boolean | Set<string>;
		ignoreValues?: boolean;
		ignoreChildren?: Set<string>;
		allowArray?: boolean;
		serializers?: Map<string, EntrySerializer>;
		baseNode?: Node;
	} = {},
): JsonObject | JsonArray {
	let baseValue =
		baseNode &&
		toJsonObject(baseNode, {
			ignoreEntries,
			ignoreValues,
			ignoreChildren,
			allowArray,
			serializers,
		});
	if (node.tag?.name === 'overwrite') {
		baseValue = undefined;
	}

	const implicitValues: JsonValue[] = [];
	const baseValues = new Map(
		isJsonObject(baseValue)
			? Object.entries(baseValue).filter(([name]) => !ignoreChildren.has(name))
			: undefined,
	);
	const result = new Map<string, JsonValue>();

	if (ignoreEntries !== true) {
		const ignoredEntries =
			ignoreEntries instanceof Set ? ignoreEntries : new Set<string>();

		for (const entry of node.entries) {
			if (ignoredEntries.has(entry.name?.name as string)) {
				continue;
			}

			if (entry.name == null) {
				implicitValues.push(deserialize(serializers, entry));
			} else {
				result.set(entry.name.name, deserialize(serializers, entry));
			}
		}
	}

	if (!ignoreValues && implicitValues.length > 0) {
		result.set(implicitKeyForValue, implicitValues);
	}

	if (node.children != null) {
		const childrenByName = new Map<string, Node[]>();
		for (const child of node.children.nodes) {
			const name = child.name.name;
			if (ignoreChildren.has(name)) {
				continue;
			}

			let childrenForName = childrenByName.get(name);
			if (childrenForName == null) {
				childrenForName = [];
				childrenByName.set(name, childrenForName);
			}

			childrenForName.push(child);
		}

		for (const [name, children] of childrenByName) {
			if (
				name !== arrayItemKey &&
				children.length === 1 &&
				!isJsonArray(baseValues.get(name))
			) {
				const baseChildren = baseNode?.children?.nodes.filter(
					child => child.name.name === name,
				);

				result.set(
					name,
					toJsonValue(children[0]!, {
						serializers,
						baseNode: baseChildren?.[0],
					}),
				);
				continue;
			}

			const ownValues: JsonValue[] = [];
			const prepend: JsonValue[] = [];
			const append: JsonValue[] = [];

			for (const child of children) {
				const value = toJsonValue(child, {serializers});

				switch (child.tag?.name) {
					case 'append':
						append.push(value);
						break;
					case 'prepend':
						prepend.push(value);
						break;
					default:
						ownValues.push(value);
				}
			}

			const baseResult = baseValues.get(name);
			const childResult = [
				...prepend,
				...(ownValues.length === 0 && isJsonArray(baseResult)
					? baseResult
					: ownValues),
				...append,
			];

			if (name !== arrayItemKey) {
				result.set(
					name,
					childResult.length === 1 ? childResult[0]! : childResult,
				);
				continue;
			}

			if (
				allowArray &&
				childrenByName.size === 1 &&
				result.size == 0 &&
				baseValues.size == 0
			) {
				return childResult;
			}

			result.set(implicitKeyForValue, childResult);
		}
	}

	return Object.fromEntries(new Map([...baseValues, ...result]));
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
	{serializers}: {serializers?: Map<string, EntrySerializer>} = {},
) {
	if (nodeOrDocument instanceof Node) {
		const matchingEntryIndex = nodeOrDocument.entries.findIndex(
			entry => entry.name?.name === name,
		);

		if (matchingEntryIndex !== -1) {
			if (
				updateEntry(
					serializers,
					nodeOrDocument.entries[matchingEntryIndex]!,
					value,
				)
			) {
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
	{serializers}: {serializers?: Map<string, EntrySerializer>} = {},
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

	if (updateEntry(serializers, entries[index]!, value)) {
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
