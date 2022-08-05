import type {json} from '@angular-devkit/core';
import {isJsonArray, isJsonObject, JsonObject, JsonValue} from '@snuggery/core';

type JsonObjectSchema = JsonObject & {type: 'object'; properties: JsonObject};

type JsonPointer = json.schema.JsonPointer;

export function createWorkspaceTransform(
	workspaceFilename: string | undefined,
	{
		appliedAliases,
	}: {
		appliedAliases?: Map<JsonPointer, JsonPointer>;
	} = {},
): json.schema.JsonVisitor {
	if (!workspaceFilename?.endsWith('.kdl')) {
		return value => value;
	}

	return (value, pointer, schema) => {
		if (!isJsonObject(schema)) {
			return value;
		}

		if (schema.type === 'array') {
			return autoArray(value, pointer, appliedAliases);
		}

		if (schema.type === 'object' && isJsonObject(schema.properties)) {
			if (isJsonObject(value)) {
				return applyAliases(
					value,
					pointer,
					schema as JsonObjectSchema,
					appliedAliases,
				);
			}

			return autoObject(
				value,
				pointer,
				schema as JsonObjectSchema,
				appliedAliases,
			);
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

			if (arraySchemas.length === 1 && isJsonArray(value)) {
				return value;
			}

			if (objectSchemas.length === 1) {
				if (isJsonObject(value)) {
					return applyAliases(
						value,
						pointer,
						objectSchemas[0]!,
						appliedAliases,
					);
				}

				return autoObject(value, pointer, objectSchemas[0]!, appliedAliases);
			}

			if (arraySchemas.length === 1) {
				return autoArray(value, pointer, appliedAliases);
			}

			return value;
		}

		return value;
	};
}

function applyAliases(
	value: JsonObject,
	pointer: JsonPointer,
	schema: JsonObjectSchema,
	appliedAliases?: Map<JsonPointer, JsonPointer>,
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
		Object.entries(value).map(([key, value]) => {
			const alias = aliases.get(key);

			if (alias == null) {
				return [key, value];
			}

			appliedAliases?.set(
				`${pointer}/${key}` as JsonPointer,
				`${pointer}/${alias}` as JsonPointer,
			);
			return [alias, value];
		}),
	);
}

function autoArray(
	value: JsonValue,
	pointer: JsonPointer,
	appliedAliases?: Map<JsonPointer, JsonPointer>,
): JsonValue[] {
	if (isJsonArray(value)) {
		return value;
	}

	appliedAliases?.set(pointer, `${pointer}/0` as JsonPointer);
	return [value];
}

function autoObject(
	value: Exclude<JsonValue, JsonObject>,
	pointer: JsonPointer,
	schema: JsonObjectSchema,
	appliedAliases?: Map<JsonPointer, JsonPointer>,
): JsonObject {
	const [$implicitProperty] = Object.entries(schema.properties).find(
		([, property]) =>
			isJsonObject(property) &&
			(property.alias === '$implicit' ||
				(isJsonArray(property.alias) && property.alias.includes('$implicit'))),
	) ?? ['$implicit'];

	appliedAliases?.set(
		pointer,
		`${pointer}/${$implicitProperty}` as JsonPointer,
	);
	return {[$implicitProperty]: value};
}
