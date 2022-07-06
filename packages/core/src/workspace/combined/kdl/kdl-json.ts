// cspell:ignore serializers

import type {JsonArray} from '@angular-devkit/core';
import {Document, Entry, Identifier, Node} from '@bgotink/kdl';

import {
	isJsonArray,
	isJsonObject,
	JsonObject,
	JsonPropertyPath,
	JsonValue,
	stringifyPath,
} from '../../types';

import {getDocument, replaceNodeInPlace} from './kdl-utils';

export interface EntrySerializer {
	deserialize(entry: Entry): JsonValue;
	serialize(entry: Entry, value: JsonValue): boolean;
}

function deserialize(
	serializers: Map<string, EntrySerializer> | undefined,
	entry: Entry,
) {
	const serializer = serializers?.get(entry.getTag()!);
	return serializer ? serializer.deserialize(entry) : entry.getValue();
}

function updateEntry(
	serializers: Map<string, EntrySerializer> | undefined,
	entry: Entry,
	value: JsonValue,
) {
	const serializer = serializers?.get(entry.getTag()!);

	if (serializer) {
		return serializer.serialize(entry, value);
	}

	if (isJsonObject(value) || isJsonArray(value)) {
		return false;
	}

	if (entry.getValue() !== value) {
		entry.setValue(value);
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

	const nodes = document.findNodesByName(name);

	if (nodes.length === 0) {
		return null;
	}

	if (nodes.length > 1) {
		return {nodes: nodes as [Node, ...Node[]], document};
	}

	const child = nodes[0]!;
	const itemChildren = child.findNodesByName(arrayItemKey);
	if (itemChildren.length > 0) {
		return {
			nodes: itemChildren as [Node, ...Node[]],
			document: child.children!,
		};
	}

	return {
		entries: child.getArgumentEntries(),
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
	if (node.hasChildren() || node.hasProperties()) {
		return toJsonObject(node, {
			serializers,
			baseNode,
		});
	}

	const values = node.entries.map(entry => deserialize(serializers, entry));
	if (values.length === 0) {
		if (node.children != null) {
			// lorem {} -> set lorem to an object
			return toJsonObject(node, {serializers, baseNode});
		}

		// TODO: make this true, like a flag?
		// options { watch; codeCoverage; }
		return null;
	}

	if (baseNode != null) {
		switch (node.getTag()) {
			case 'append':
				return [toJsonValue(baseNode, {serializers}), values].flat();
			case 'prepend':
				return [values, toJsonValue(baseNode, {serializers})].flat();
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
	const baseValue =
		baseNode != null && node.getTag() !== 'overwrite'
			? toJsonObject(baseNode, {
					ignoreEntries,
					ignoreValues,
					ignoreChildren,
					allowArray,
					serializers,
			  })
			: undefined;

	const implicitValues: JsonValue[] = [];
	const baseValues = new Map(
		isJsonObject(baseValue)
			? Object.entries(baseValue).filter(([name]) => !ignoreChildren.has(name))
			: undefined,
	);
	const result = new Map<string, JsonValue>();

	if (ignoreEntries !== true) {
		const ignoredEntries = ignoreEntries || undefined;

		for (const entry of node.entries) {
			const name = entry.getName();
			if (ignoredEntries?.has(name as string)) {
				continue;
			}

			if (name == null) {
				implicitValues.push(deserialize(serializers, entry));
			} else {
				result.set(name, deserialize(serializers, entry));
			}
		}
	}

	if (!ignoreValues && implicitValues.length > 0) {
		result.set(
			implicitKeyForValue,
			implicitValues.length === 1 ? implicitValues[0]! : implicitKeyForValue,
		);
	}

	if (node.children != null) {
		const childrenByName = new Map<string, Node[]>();
		for (const child of node.children.nodes) {
			const name = child.getName();
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
				const baseChildren = baseNode?.findNodesByName(name);

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

				switch (child.getTag()) {
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
				value.map(item => Entry.createArgument(item)),
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

	return new Node(new Identifier(name), [Entry.createArgument(value)]);
}

export function fromJsonObject(
	object: JsonObject,
	nodeName: string,
	{ignoreEntries = false} = {},
): Node {
	const node = Node.create(nodeName);

	for (const [name, value] of Object.entries(object)) {
		if (!ignoreEntries) {
			if (name === implicitKeyForValue && isJsonArray(value)) {
				if (isArrayOfPrimitive(value)) {
					node.entries.push(...value.map(item => Entry.createArgument(item)));
					continue;
				}
			}

			if (!isJsonObject(value) && !isJsonArray(value)) {
				if (name === implicitKeyForValue) {
					node.addArgument(value);
				} else {
					node.setProperty(name, value);
				}
				continue;
			}
		}

		node.appendNode(fromJsonValue(value, name, {allowDocument: true}));
	}

	return node;
}

export function deleteValue(nodeOrDocument: Node | Document, name: string) {
	nodeOrDocument.removeNodesByName(name);

	if (nodeOrDocument instanceof Node) {
		nodeOrDocument.deleteProperty(name);
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

		node.removeArgument(index);
		return;
	}

	const {nodes, document} = items;

	if (index >= nodes.length) {
		throw new Error(`Failed to find ${stringifyPath(path)} to delete`);
	}

	document.removeNode(nodes[index]!);
}

export function addValue(
	path: JsonPropertyPath,
	nodeOrDocument: Node | Document,
	name: string,
	value: JsonValue,
	{tryEntry = true} = {},
) {
	if (nodeOrDocument.findNodeByName(name)) {
		throw new Error(`Didn't expect ${stringifyPath(path)} to already exist`);
	}

	if (nodeOrDocument instanceof Node) {
		if (nodeOrDocument.hasProperty(name)) {
			throw new Error(`Didn't expect ${stringifyPath(path)} to already exist`);
		}

		if (tryEntry && (value == null || typeof value !== 'object')) {
			nodeOrDocument.entries.push(Entry.createProperty(name, value));
			return;
		}
	}

	// We must add a child node

	nodeOrDocument.appendNode(fromJsonValue(value, name, {allowDocument: true}));
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

		document.insertNodeAfter(
			fromJsonValue(value, nodes[0].name.name),
			nodes[nodes.length - 1]!,
		);
		return;
	}

	const {entries, node, document} = items;

	if (value == null || typeof value !== 'object') {
		node.entries.splice(
			node.entries.indexOf(entries[entries.length - 1]!) + 1,
			0,
			Entry.createArgument(value),
		);
		return;
	}

	// We're adding an object to an array... split the entries into children
	// instead

	if (entries.length === node.entries.length) {
		document.replaceNode(
			node,
			new Document([
				...entries.map(entry => new Node(new Identifier(name), [entry])),
				fromJsonValue(value, name),
			]),
		);
		return;
	}

	// This node has properties, so turn entries into children with `-`

	node.entries = node.getPropertyEntries();
	node.appendNode(
		new Document([
			...entries.map(entry => new Node(new Identifier(arrayItemKey), [entry])),
			fromJsonValue(value, arrayItemKey),
		]),
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
		const entry = nodeOrDocument.getPropertyEntry(name);

		if (entry != null) {
			if (updateEntry(serializers, entry, value)) {
				return;
			}

			// We have to move from a property to a child node
			nodeOrDocument.deleteProperty(name);
			nodeOrDocument.appendNode(fromJsonValue(value, name));
		}
	}

	const existingChild = nodeOrDocument.findNodesByName(name)?.[0];

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
		document.replaceNode(
			node,
			new Document(
				entries.map((v, i) =>
					i === index
						? fromJsonValue(value, name)
						: new Node(new Identifier(name), [v]),
				),
			),
		);
	}

	// This node has properties, so turn entries into children with `-`

	node.entries = node.getPropertyEntries();
	node.appendNode(
		new Document(
			entries.map((entry, i) =>
				i === index
					? fromJsonValue(value, arrayItemKey)
					: new Node(new Identifier(arrayItemKey), [entry]),
			),
		),
	);
}
