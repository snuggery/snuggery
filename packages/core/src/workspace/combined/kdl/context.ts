import {Document, Node, Value} from '@bgotink/kdl';

import {InvalidConfigurationError, JsonObject, JsonValue} from '../../types';

import {unpackSingleValue} from './utils';

export interface Serializer {
	toJson(value: Value['value']): Exclude<JsonValue, JsonObject | JsonValue[]>;

	fromJson(value: Exclude<JsonValue, JsonObject | JsonValue[]>): Value['value'];
}

export interface ParserContext {
	readonly tags: ReadonlyMap<string, Serializer>;

	readonly node: Node | Node[];

	readonly extends?: Omit<ParserContext, 'tags'>;
}

export function hasNamedSubContext(
	context: Pick<ParserContext, 'node' | 'extends'> | undefined,
	name: string,
): boolean {
	const node = getNode(context);
	if (context == null || node == null) {
		return false;
	}

	return (
		node.findNodeByName(name) != null ||
		hasNamedSubContext(context.extends, name)
	);
}

export function namedSubContext(
	context: ParserContext | undefined,
	name: string,
): ParserContext | undefined {
	const node = getNode(context);
	if (node == null || context == null) {
		return undefined;
	}

	const nodes = node.findNodesByName(name);
	const _extends =
		context.extends &&
		namedSubContext({...context.extends, tags: context.tags}, name);

	if (!nodes?.length) {
		return _extends && {..._extends, tags: context.tags};
	}

	return {
		...context,
		node: unpackSingleValue(nodes),
		extends: _extends,
	};
}

export function getNode(
	context: Pick<ParserContext, 'node'> | undefined,
): Node | null {
	if (context == null || context.node instanceof Document) {
		return null;
	}

	if (context.node instanceof Node) {
		return context.node;
	}

	return context.node.length === 1 ? context.node[0]! : null;
}

export function getNodes(context: Pick<ParserContext, 'node'>): Node[] {
	return context.node instanceof Node ? [context.node] : context.node;
}

export function collectNodes(context: ParserContext): Node[] {
	const allPrepended: Node[] = [];
	const allAppended: Node[] = [];

	let currentContext: Omit<ParserContext, 'tags'> | undefined = context;
	while (currentContext != null) {
		const prepended: Node[] = [];
		const appended: Node[] = [];
		const ownValues: Node[] = [];

		// eslint-disable-next-line no-inner-declarations
		function getArray(node: Node) {
			switch (node.getTag()) {
				case 'prepend':
					return prepended;
				case 'append':
					return appended;
				default:
					return ownValues;
			}
		}

		for (const node of getNodes(currentContext)) {
			getArray(node).push(node);
		}

		allPrepended.push(...prepended);
		allAppended.unshift(...appended);

		if (ownValues.length > 0) {
			return [...allPrepended, ...ownValues, ...allAppended];
		}

		currentContext = currentContext.extends;
	}

	return [...allPrepended, ...allAppended];
}

export function collectParameterizedSubContexts(
	context:
		| ParserContext
		| (Omit<ParserContext, 'node'> & {node: Document})
		| undefined,
	nodeName: string,
): Map<string, ParserContext & {node: Node}> {
	if (context == null) {
		return new Map();
	}

	const extended = collectParameterizedSubContexts(
		context.extends && {...context.extends, tags: context.tags},
		nodeName,
	);

	const location =
		context.node instanceof Document
			? context.node
			: getNode(context as ParserContext);
	const namedNodes = location?.findNodesByName(nodeName) ?? [];

	return new Map([
		...extended,
		...namedNodes
			.map((node): [string, ParserContext & {node: Node}] | null => {
				const args = node.getArguments();
				if (args.length !== 1 || typeof args[0] !== 'string') {
					return null;
				}

				return [
					args[0],
					{
						...context,
						node,
						extends:
							node.getTag() === 'overwrite' ? undefined : extended.get(args[0]),
					},
				];
			})
			.filter(
				(value): value is [string, ParserContext & {node: Node}] =>
					value != null,
			),
	]);
}

export function getSingleValue(
	context: ParserContext | undefined,
	location: string,
): Value['value'] {
	const values = getNode(context)?.getArguments() ?? [];

	if (values.length !== 1) {
		throw new InvalidConfigurationError(`Expected a single value ${location}`);
	}

	return values[0]!;
}

export function getSingleStringValue(
	context: ParserContext | undefined,
	location: string,
): string {
	const value = getSingleValue(context, location);

	if (typeof value !== 'string') {
		throw new InvalidConfigurationError(
			`Expected a string but got ${
				value == null ? 'null' : typeof value
			} ${location}`,
		);
	}

	return value;
}
