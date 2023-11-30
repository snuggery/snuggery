import type {Entry} from '@bgotink/kdl';

import type {JsonObject, JsonValue} from '../../types';

import type {ParserContext} from './context';
import type {JsonPrimitive} from './json-utils';

export function parseTaggedValue(
	context: Pick<ParserContext, 'tags'>,
	value: Entry[],
): JsonValue[];
export function parseTaggedValue(
	context: Pick<ParserContext, 'tags'>,
	value: Entry | Entry[],
): JsonValue;
export function parseTaggedValue(
	context: Pick<ParserContext, 'tags'>,
	value: Entry | Entry[],
): JsonValue {
	if (Array.isArray(value)) {
		return value.map((v) => parseTaggedValue(context, v));
	}

	const tag = context.tags.get(value.getTag()!);
	return tag ? tag.toJson(value.getValue()) : value.getValue();
}

export function updateTaggedEntry(
	context: Pick<ParserContext, 'tags'>,
	entry: Entry,
	value: Exclude<JsonValue, JsonValue[] | JsonObject>,
) {
	const tag = context.tags.get(entry.getTag()!);
	entry.setValue(tag ? tag.fromJson(value) : value);
}

export function updateTaggedValue(
	context: ParserContext,
	name: string,
	value: JsonPrimitive,
): void;
export function updateTaggedValue(
	context: ParserContext,
	name: null,
	value: JsonPrimitive | JsonPrimitive[],
): void;
export function updateTaggedValue(
	context: ParserContext,
	name: string | null,
	value: JsonPrimitive | JsonPrimitive[],
): void {
	if (name != null) {
		const entry = context.node.getPropertyEntry(name);

		if (entry != null) {
			updateTaggedEntry(context, entry, value as JsonPrimitive);
		} else {
			context.node.setProperty(name, value as JsonPrimitive);
		}

		return;
	}

	if (!Array.isArray(value)) {
		value = [value];
	}

	const entries = context.node.getArgumentEntries();

	if (entries.length <= value.length) {
		for (const [i, v] of value.entries()) {
			if (i >= entries.length) {
				context.node.addArgument(v);
			} else {
				updateTaggedEntry(context, entries[i]!, v);
			}
		}
	} else {
		for (const [i, e] of entries.entries()) {
			if (i >= value.length) {
				context.node.removeArgument(value.length);
			} else {
				updateTaggedEntry(context, e, value[i]!);
			}
		}
	}
}
