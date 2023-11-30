import type {Entry} from '@bgotink/kdl';

import {InvalidConfigurationError, JsonObject, JsonValue} from '../../../types';
import {namedSubContext, ParserContext} from '../context';
import {implicitPropertyKey, tagOverwrite} from '../kdl-utils';
import {parseTaggedValue} from '../tags';
import {unpackSingleValue} from '../utils';

import {namelessName, superName} from './utils';

export function toJsonValue(context: ParserContext): JsonValue {
	const {node} = context;

	switch (node.getTag()) {
		case 'array':
			return toJsonArray(context);
		case 'object':
			return toJsonObject(context);
	}

	if (node.hasProperties()) {
		return toJsonObject(context);
	}

	if (node.hasChildren()) {
		if (
			node.children!.nodes.every(
				(node) =>
					node.getName() === namelessName || node.getName() === superName,
			)
		) {
			return toJsonArray(context);
		}

		return toJsonObject(context);
	}

	// A primitive, so no need to look at the `extends`

	const value = node.getArgumentEntries();
	return parseTaggedValue(context, unpackSingleValue(value));
}

export function getArrayItems(
	context: ParserContext,
): (ParserContext | ParserContext<Entry>)[] {
	const result: (ParserContext | ParserContext<Entry>)[] = context.node
		.getArgumentEntries()
		.map((entry) => ({
			...context,
			node: entry,
			extends: undefined,
		}));

	for (const child of context.node.children?.nodes ?? []) {
		switch (child.getName()) {
			case superName:
				if (context.extends == null) {
					throw new InvalidConfigurationError(
						`Cannot have ${JSON.stringify(
							superName,
						)} in a node that doesn't extend another`,
					);
				}

				result.push(...getArrayItems(context.extends));
				break;
			case namelessName:
				result.push({
					...context,
					node: child,
					extends: undefined,
				});
				break;
			default:
				throw new InvalidConfigurationError(
					`Array items have to be called ${JSON.stringify(namelessName)}`,
				);
		}
	}

	return result;
}

function isEntryContext(
	context: ParserContext | ParserContext<Entry>,
): context is ParserContext<Entry> {
	return context.node.type === 'entry';
}

function toJsonArray(context: ParserContext): JsonValue[] {
	return getArrayItems(context).map((item) =>
		isEntryContext(item)
			? parseTaggedValue(item, item.node)
			: toJsonValue(item),
	);
}

export function toJsonObject(
	context: ParserContext,
	{
		ignoreArguments = false,
		ignoreProperties = false,
		ignoreChildren,
	}: {
		ignoreArguments?: boolean;
		ignoreProperties?: boolean | Set<string>;
		ignoreChildren?: Set<string>;
	} = {},
): JsonObject {
	const {node} = context;
	const extendedProperties = new Map(
		context.extends && node.getTag() !== tagOverwrite
			? Object.entries(
					toJsonObject(context.extends, {
						ignoreArguments,
						ignoreChildren,
						ignoreProperties,
					}),
			  )
			: undefined,
	);
	const ownProperties = new Map<string, JsonValue>();

	if (!ignoreArguments && node.hasArguments()) {
		const args = node.getArgumentEntries();
		ownProperties.set(
			implicitPropertyKey,
			parseTaggedValue(context, unpackSingleValue(args)),
		);
	}

	if (ignoreProperties !== true) {
		const ignoredProperties = new Set(ignoreProperties || []);

		for (const entry of node.getPropertyEntries()) {
			const name = entry.getName()!;
			if (!ignoredProperties.has(name)) {
				ownProperties.set(name, parseTaggedValue(context, entry));
			}
		}
	}

	for (const child of node.children?.nodes || []) {
		const name = child.getName();
		if (ignoreChildren?.has(name)) {
			continue;
		}

		if (ownProperties.has(name)) {
			throw new InvalidConfigurationError(
				`Duplicate key ${JSON.stringify(name)}`,
			);
		}

		ownProperties.set(
			name === namelessName ? implicitPropertyKey : name,
			toJsonValue(namedSubContext(context, name)!),
		);
	}

	return Object.fromEntries([...extendedProperties, ...ownProperties]);
}
