import type {json} from '@angular-devkit/core';
import {isJsonArray, isJsonObject, JsonObject, JsonValue} from '@snuggery/core';

type JsonObjectSchema = JsonObject & {type: 'object'; properties: JsonObject};

type JsonPointer = json.schema.JsonPointer;

const implicitPropertyKey = '$implicit';

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

		if (isJsonObject(value) && !Reflect.has(value, implicitPropertyKey)) {
			return value;
		}

		if (schema.type === 'object' && isJsonObject(schema.properties)) {
			return supportImplicit(
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
				return supportImplicit(
					value,
					pointer,
					objectSchemas[0]!,
					appliedAliases,
				);
			}

			return value;
		}

		return value;
	};
}

function supportImplicit(
	value: JsonValue,
	pointer: JsonPointer,
	schema: JsonObjectSchema,
	appliedAliases?: Map<JsonPointer, JsonPointer>,
): JsonValue {
	if (implicitPropertyKey in schema.properties) {
		return isJsonObject(value) ? value : {[implicitPropertyKey]: value};
	}

	const configuredImplicitProperty = Object.entries(schema.properties).find(
		([, property]) =>
			isJsonObject(property) &&
			(isJsonArray(property.aliases)
				? property.aliases.includes(implicitPropertyKey)
				: property.alias === implicitPropertyKey),
	);

	if (!configuredImplicitProperty) {
		return value;
	}

	if (!isJsonObject(value)) {
		appliedAliases?.set(
			pointer,
			`${pointer}/${configuredImplicitProperty[0]}` as JsonPointer,
		);
		return {[configuredImplicitProperty[0]]: value};
	}

	appliedAliases?.set(
		`${pointer}/${implicitPropertyKey}` as JsonPointer,
		`${pointer}/${configuredImplicitProperty[0]}` as JsonPointer,
	);
	return Object.fromEntries(
		Object.entries(value).map(([name, property]) => [
			name === implicitPropertyKey ? configuredImplicitProperty[0] : name,
			property,
		]),
	);
}
