import type {JsonValue, schema} from '@angular-devkit/core';
import {isJsonArray, isJsonObject} from '@snuggery/core';

export function applyAliases(
	value: JsonValue,
	_pointer: schema.JsonPointer,
	schema?: schema.JsonSchema,
): JsonValue {
	if (
		!isJsonObject(value) ||
		!isJsonObject(schema) ||
		!isJsonObject(schema.properties)
	) {
		return value;
	}

	const properties = new Set(Object.keys(schema.properties));
	const aliases = new Map<string, string>();
	for (const [property, definition] of Object.entries(schema.properties)) {
		if (!isJsonObject(definition)) {
			continue;
		}

		for (const alias of isJsonArray(definition.alias)
			? definition.alias
			: [definition.alias]) {
			if (
				typeof alias !== 'string' ||
				aliases.has(alias) ||
				properties.has(alias)
			) {
				continue;
			}

			aliases.set(alias, property);
		}
	}

	if (aliases.size === 0) {
		return value;
	}

	return Object.fromEntries(
		Object.entries(value).map(([key, value]) => [
			aliases.get(key) ?? key,
			value,
		]),
	);
}

export function autoArray(
	value: JsonValue,
	_pointer: schema.JsonPointer,
	schema?: schema.JsonSchema,
): JsonValue {
	if (
		isJsonObject(schema) &&
		schema.type === 'array' &&
		value != null &&
		!isJsonArray(value)
	) {
		return [value];
	}

	return value;
}

export function autoObject(
	value: JsonValue,
	_pointer: schema.JsonPointer,
	schema?: schema.JsonSchema,
): JsonValue {
	if (
		isJsonObject(schema) &&
		(schema.type === 'object' || isJsonObject(schema.properties)) &&
		value != null &&
		!isJsonObject(value)
	) {
		return {$implicit: value};
	}

	return value;
}
