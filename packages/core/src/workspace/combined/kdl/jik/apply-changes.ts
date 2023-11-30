import {Document, Entry, Node} from '@bgotink/kdl';

import {type Change, ChangeType} from '../../../proxy';
import type {
	JsonPropertyName,
	JsonPropertyPath,
	JsonValue,
} from '../../../types';
import {hasNamedSubContext, namedSubContext, ParserContext} from '../context';
import {isArrayOfPrimitives, isPrimitive} from '../json-utils';
import {implicitPropertyKey, tagOverwrite} from '../kdl-utils';
import {updateTaggedEntry, updateTaggedValue} from '../tags';

import {getArrayItems} from './parse';
import {fromJsonValue} from './serialize';
import {namelessName, superName} from './utils';

function deleteFromObject(node: Node, name: string) {
	if (name === implicitPropertyKey) {
		node.entries = node.getPropertyEntries();
		node.removeNodesByName(namelessName);
		return;
	}

	node.deleteProperty(name);
	node.removeNodesByName(name);
}

function addToObject(
	node: Node,
	name: string,
	value: JsonValue,
	{allowEntries}: {allowEntries: boolean},
) {
	if (name !== implicitPropertyKey) {
		node.appendNode(fromJsonValue(name, value, {allowEntries}));
		return;
	}

	if (allowEntries) {
		if (isPrimitive(value)) {
			node.addArgument(value);
			return;
		}

		if (isArrayOfPrimitives(value)) {
			for (const v of value) {
				node.addArgument(v);
			}
			return;
		}
	}

	node.appendNode(fromJsonValue(implicitPropertyKey, value, {allowEntries}));
}

function updateInObject(
	context: ParserContext,
	name: string,
	value: JsonValue,
	{allowEntries}: {allowEntries: boolean},
) {
	const {node} = context;

	if (name === implicitPropertyKey) {
		if (node.hasArguments()) {
			if (isPrimitive(value) || isArrayOfPrimitives(value)) {
				updateTaggedValue(context, null, value);
				return;
			}

			node.entries = node.getPropertyEntries();
		}

		name = namelessName;
	}

	if (node.hasProperty(name)) {
		if (isPrimitive(value)) {
			updateTaggedValue(context, name, value);
			return;
		}

		node.deleteProperty(name);
	}

	const existingNodes = node.findNodesByName(name);
	const newNode = fromJsonValue(name, value, {allowEntries});

	if (hasNamedSubContext(context.extends, name) && !isPrimitive(value)) {
		// value exists in parent, so add tag to overwrite instead of merge
		newNode.setTag(tagOverwrite);
	}

	node.insertNodeBefore(newNode, existingNodes[0] ?? null);

	const nodesToDelete = new Set(existingNodes);
	node.children!.nodes = node.children!.nodes.filter(
		(n) => !nodesToDelete.has(n),
	);
}

function _applyChangeToObject(
	context: ParserContext,
	name: string,
	change: Change,
	{allowEntries = true} = {},
) {
	const node = context.node;

	if (change.type === ChangeType.Delete) {
		deleteFromObject(node, name);
		return;
	}

	if (change.type === ChangeType.Add) {
		addToObject(node, name, change.value, {allowEntries});
		return;
	}

	updateInObject(context, name, change.value, {allowEntries});
}

function _applyChangeToArray(
	context: ParserContext,
	index: number,
	change: Change,
) {
	const {node} = context;
	const items = getArrayItems(context);

	// First try to apply changes without having to copy over the entire array

	if (change.type === ChangeType.Add) {
		if (index === 0) {
			if (isPrimitive(change.value)) {
				node.entries.unshift(Entry.createArgument(change.value));
			} else {
				const newNode = fromJsonValue(namelessName, change.value);

				if (node.children) {
					node.children.nodes.unshift(newNode);
				} else {
					node.children = new Document([newNode]);
				}
			}

			return;
		}

		if (index === items.length) {
			const lastItem = items[items.length - 1];

			if (
				isPrimitive(change.value) &&
				(lastItem == null ||
					(lastItem.node.type === 'entry' &&
						node.entries.includes(lastItem.node)))
			) {
				// array was empty or all array items are entries on the node itself -> we can append an entry
				node.addArgument(change.value);
			} else {
				node.appendNode(fromJsonValue(namelessName, change.value));
			}

			return;
		}

		const {node: before} = items[index - 1]!;

		if (before.type === 'entry' && node.entries.includes(before)) {
			const {value} = change;
			if (isPrimitive(value)) {
				node.entries = node.entries.flatMap((entry) =>
					entry === before ? [entry, Entry.createArgument(value)] : entry,
				);

				return;
			}

			const newNodes = [
				fromJsonValue(namelessName, change.value),
				...node.entries.slice(index).map((entry) => {
					const newNode = Node.create(namelessName);
					newNode.entries.push(entry);
					return newNode;
				}),
			];

			node.entries = node.entries.slice(0, index);
			if (node.children) {
				node.children.nodes.unshift(...newNodes);
			} else {
				node.children = new Document(newNodes);
			}

			return;
		}

		if (before.type === 'node' && node.children?.nodes.includes(before)) {
			node.insertNodeAfter(fromJsonValue(namelessName, change.value), before);
			return;
		}

		const {node: after} = items[index]!;
		if (after.type === 'node' && node.children?.nodes.includes(after)) {
			node.insertNodeBefore(fromJsonValue(namelessName, change.value), after);
			return;
		}
	} else if (change.type === ChangeType.Delete) {
		const existing = items[index]!;

		if (existing.node.type === 'entry') {
			if (node.entries.includes(existing.node)) {
				node.entries = node.entries.filter((entry) => entry !== existing.node);
				return;
			}
		} else {
			if (node.children?.nodes.includes(existing.node)) {
				node.removeNode(existing.node);
				return;
			}
		}
	} /* (change.type === ChangeType.Modify) */ else {
		const existing = items[index]!;

		if (existing.node.type === 'entry') {
			if (node.entries.includes(existing.node)) {
				if (isPrimitive(change.value)) {
					updateTaggedEntry(context, existing.node, change.value);
					return;
				}

				const newNodes = [
					fromJsonValue(namelessName, change.value),
					...node.entries.slice(index + 1).map((entry) => {
						const newNode = Node.create(namelessName);
						newNode.entries.push(entry);
						return newNode;
					}),
				];

				node.entries = node.entries.slice(0, index);
				if (node.children) {
					node.children.nodes.unshift(...newNodes);
				} else {
					node.children = new Document(newNodes);
				}

				return;
			}
		} else {
			if (node.children?.nodes.includes(existing.node)) {
				node.replaceNode(
					existing.node,
					fromJsonValue(namelessName, change.value),
				);
				return;
			}
		}
	}

	// Alas, clone the entire array

	if (node.findNodeByName(superName) == null) {
		throw new Error('Expected super node in array');
	}

	inlineArray(context);

	_applyChangeToArray(
		{
			...context,
			extends: undefined,
		},
		index,
		change,
	);
}

function inlineArray(context: ParserContext) {
	const ownEntries: Entry[] = [];
	const ownNodes: Node[] = [];

	for (const item of getArrayItems(context)) {
		if (item.node.type === 'node') {
			ownNodes.push(item.node);
			continue;
		}

		if (ownNodes.length === 0) {
			ownEntries.push(item.node);
			continue;
		}

		const newNode = Node.create(namelessName);
		newNode.entries.push(item.node);
		ownNodes.push(newNode);
	}

	context.node.entries = ownEntries;
	context.node.children = ownNodes.length > 0 ? new Document(ownNodes) : null;
}

export function applyChangeToJsonValue(
	context: ParserContext,
	[name, ...path]: [JsonPropertyName, ...JsonPropertyPath],
	change: Change,
	{allowEntries = true} = {},
) {
	if (path.length === 0) {
		if (typeof name === 'string') {
			_applyChangeToObject(context, name, change, {allowEntries});
		} else {
			_applyChangeToArray(context, name, change);
		}

		return;
	}

	const {node} = context;

	if (typeof name === 'number') {
		const items = getArrayItems(context);
		let nextContext = items[name] as ParserContext;

		if (!node.children?.nodes.includes(nextContext.node)) {
			inlineArray(context);
			nextContext = getArrayItems(context)[name] as ParserContext;
		}

		context = nextContext;
	} else {
		context = namedSubContext(context, name)!;
	}

	applyChangeToJsonValue(
		context,
		path as [JsonPropertyName, ...JsonPropertyPath],
		change,
	);
}
