import type {json} from '@angular-devkit/core';
import {isJsonArray, isJsonObject, JsonObject, JsonValue} from '@snuggery/core';

type JsonObjectSchema = JsonObject & {type: 'object'; properties: JsonObject};

export function createWorkspaceTransform(
	workspaceFilename: string | undefined,
): json.schema.JsonVisitor {
	if (!workspaceFilename?.endsWith('.kdl')) {
		return value => value;
	}

	return (value, pointer, schema) => {
		if (!isJsonObject(schema)) {
			return value;
		}

		if (schema.type === 'array') {
			return autoArray(value);
		}

		if (schema.type === 'object' && isJsonObject(schema.properties)) {
			if (isJsonObject(value)) {
				return applyAliases(value, pointer, schema as JsonObjectSchema);
			}

			return autoObject(value, pointer, schema as JsonObjectSchema);
		}

		for (const key of ['oneOf', 'anyOf']) {
			const options = schema[key];
			if (!isJsonArray(options)) {
				continue;
			}

			const arraySchemas: JsonObject[] = [];
			const objectSchemas: JsonObjectSchema[] = [];

			for (const option of options) {
				if (!isJsonObject(option)) {
					continue;
				}

				if (value == null && option.type === 'null') {
					return value;
				} else if (typeof value !== 'object' && typeof value === option.type) {
					return value;
				} else if (option.type === 'array') {
					arraySchemas.push(option);
				} else if (
					option.type === 'object' &&
					isJsonObject(option.properties)
				) {
					objectSchemas.push(option as JsonObjectSchema);
				}
			}

			const singleObjectSchema =
				objectSchemas.length === 1 ? objectSchemas[0]! : null;
			const singleArraySchema =
				arraySchemas.length === 1 ? arraySchemas[0]! : null;

			if (singleObjectSchema != null) {
				if (isJsonObject(value)) {
					return applyAliases(value, pointer, singleObjectSchema);
				}

				return autoObject(value, pointer, singleObjectSchema);
			} else if (singleArraySchema != null) {
				return autoArray(value);
			}

			return value;
		}

		return value;
	};
}

function applyAliases(
	value: JsonObject,
	_pointer: json.schema.JsonPointer,
	schema: JsonObjectSchema,
): JsonValue {
	const properties = new Set(Object.keys(schema.properties));
	const presentProperties = new Set(Object.keys(value));
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
				properties.has(alias) ||
				!presentProperties.has(alias)
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

function autoArray(value: JsonValue): JsonValue[] {
	return isJsonArray(value) ? value : [value];
}

function autoObject(
	value: Exclude<JsonValue, JsonObject>,
	_pointer: json.schema.JsonPointer,
	schema: JsonObjectSchema,
): JsonObject {
	const [$implicitProperty] = Object.entries(schema.properties).find(
		([, property]) =>
			isJsonObject(property) &&
			(property.alias === '$implicit' ||
				(isJsonArray(property.alias) && property.alias.includes('$implicit'))),
	) ?? ['$implicit'];

	return {[$implicitProperty]: value};
}
