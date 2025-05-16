import type {SchematicContext, Tree} from "@angular-devkit/schematics";

import {Journey, getTree, registerGuide, getContext} from "../types";
import {MapWithDefault, WeakMapWithDefault} from "../utils";

export interface TreeVisitor {
	(tree: Tree, context: SchematicContext): void | Promise<void>;
}

export interface TreeVisitorWithInput<I> {
	(input: I[], tree: Tree, context: SchematicContext): void | Promise<void>;
}

const visitors = new WeakMapWithDefault<
	Journey,
	MapWithDefault<TreeVisitorWithInput<unknown>, unknown[]>
>(() => new MapWithDefault<TreeVisitorWithInput<unknown>, unknown[]>(() => []));

async function treeVisitorGuide(journey: Journey): Promise<void> {
	const tree = getTree(journey);
	const context = getContext(journey);
	const registeredTransforms = visitors.get(journey);

	if (!registeredTransforms?.size) {
		return;
	}

	for (const [visitor, inputs] of registeredTransforms) {
		await visitor(inputs, tree, context);
	}
}

export function visitTree(journey: Journey, visitor: TreeVisitor): void;
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export function visitTree<I extends {}>(
	journey: Journey,
	visitor: TreeVisitorWithInput<I>,
	input: I,
): void;
export function visitTree(
	journey: Journey,
	visitor: TreeVisitor | TreeVisitorWithInput<unknown>,
	input?: unknown,
): void {
	registerGuide(journey, treeVisitorGuide);

	if (input != null) {
		visitors
			.get(journey)
			.get(visitor as TreeVisitorWithInput<unknown>)
			.push(input);
	} else {
		visitors
			.get(journey)
			.set((_, tree, context) => (visitor as TreeVisitor)(tree, context), []);
	}
}
