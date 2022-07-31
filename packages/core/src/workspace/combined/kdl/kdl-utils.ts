import {Document, Node} from '@bgotink/kdl';

export const arrayItemKey = '-';

export const implicitPropertyKey = '$implicit';

export const tagOverwrite = 'overwrite';

export function append(
	parent: Node | Document,
	children: Node | Node[] | Document,
) {
	return parent.appendNode(
		Array.isArray(children) ? new Document(children) : children,
	);
}

export function replace(
	parent: Node | Document,
	oldNode: Node,
	newNode: Node | Node[] | Document,
) {
	return parent.replaceNode(
		oldNode,
		Array.isArray(newNode) ? new Document(newNode) : newNode,
	);
}

export function insertBefore(
	parent: Node | Document,
	children: Node | Node[] | Document,
	reference: Node | null,
) {
	return parent.insertNodeBefore(
		Array.isArray(children) ? new Document(children) : children,
		reference,
	);
}

export function insertAfter(
	parent: Node | Document,
	children: Node | Node[] | Document,
	reference: Node | null,
) {
	return parent.insertNodeAfter(
		Array.isArray(children) ? new Document(children) : children,
		reference,
	);
}

export function isChildOf(parent: Node | Document, child: Node) {
	return (
		(parent instanceof Document ? parent : parent.children)?.nodes.includes(
			child,
		) || false
	);
}

export function setTag(tag: string | null, nodes: Node[]) {
	for (const node of nodes) {
		node.setTag(tag);
	}

	return nodes;
}
