import {Document, Node, Value} from '@bgotink/kdl';

import {InvalidConfigurationError, JsonObject, JsonValue} from '../../types';

export interface Serializer {
	toJson(value: Value['value']): Exclude<JsonValue, JsonObject | JsonValue[]>;

	fromJson(value: Exclude<JsonValue, JsonObject | JsonValue[]>): Value['value'];
}

export interface ParserContext<T = Node> {
	readonly tags: ReadonlyMap<string, Serializer>;

	readonly node: T;

	readonly extends?: ParserContext<T>;
}

export function hasNamedSubContext(
	context: Pick<ParserContext, 'node' | 'extends'> | undefined,
	name: string,
): boolean {
	if (context == null) {
		return false;
	}

	return (
		context.node.findNodeByName(name) != null ||
		hasNamedSubContext(context.extends, name)
	);
}

export function namedSubContext(
	context: ParserContext | undefined,
	name: string,
): ParserContext | undefined {
	if (context == null) {
		return undefined;
	}

	const node = context.node.findNodeByName(name);
	const _extends = namedSubContext(context.extends, name);

	if (node == null) {
		return _extends;
	}

	return {
		...context,
		node,
		extends: _extends,
	};
}

export function collectParameterizedSubContexts(
	context:
		| ParserContext
		| (Omit<ParserContext, 'node' | 'location'> & {node: Document})
		| undefined,
	nodeName: string,
): Map<string, ParserContext & {node: Node}> {
	if (context == null) {
		return new Map();
	}

	const extended = collectParameterizedSubContexts(context.extends, nodeName);

	const location =
		context.node instanceof Node ? context.node.children : context.node;
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
	const values = context?.node.getArguments() ?? [];

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
