import {Document, Node, Value} from '@bgotink/kdl';

export function findNamedValue(
	node: Node,
	name: string,
): Value['value'] | undefined {
	const property = node.getProperty(name);
	if (property !== undefined) {
		return property;
	}

	return node.findParameterizedNode(name)?.getArgument(0);
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
