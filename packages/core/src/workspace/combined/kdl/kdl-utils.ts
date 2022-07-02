import {Document, Entry, Node, Value} from '@bgotink/kdl';

export function isProperty(entry: Entry): boolean {
	return entry.name != null;
}

export function isValue(entry: Entry): boolean {
	return entry.name == null;
}

export function findNamedValue(node: Node, name: string): Value | null {
	const entry = node.entries.find(entry => entry.name?.name === name);
	if (entry != null) {
		return entry.value;
	}

	if (node.children == null) {
		return null;
	}

	const children = node.children.nodes.filter(
		child =>
			child.name.name === name && child.entries.filter(isValue).length === 1,
	);
	if (children.length === 0) {
		return null;
	}

	return children[children.length - 1]!.entries.find(isValue)!.value;
}

export function getDocument(
	nodeOrDocument: Node | Document,
	create: true,
): Document;
export function getDocument(
	nodeOrDocument: Node | Document,
	create?: false,
): Document | null;
export function getDocument(
	nodeOrDocument: Node | Document,
	create = false,
): Document | null {
	if (nodeOrDocument instanceof Document) {
		return nodeOrDocument;
	}

	if (!create || nodeOrDocument.children) {
		return nodeOrDocument.children;
	}

	return (nodeOrDocument.children = new Document([]));
}

export function replaceNodeInPlace(oldNode: Node, newNode: Node): void {
	oldNode.tag = newNode.tag;
	oldNode.entries = newNode.entries;

	if (newNode.children == null) {
		oldNode.children = null;
	} else if (oldNode.children != null) {
		oldNode.children.nodes = newNode.children.nodes;
	} else {
		oldNode.children = newNode.children;
	}
}
