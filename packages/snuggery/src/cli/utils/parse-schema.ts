import type {json} from '@angular-devkit/core';
import {isJsonArray, isJsonObject, JsonObject, JsonValue} from '@snuggery/core';

import {isNotNull} from './varia';

export enum Type {
	String = 'string',
	Boolean = 'boolean',
	Number = 'number',
	StringArray = 'string array',
	Object = 'object',
}

export interface Option {
	name: string;

	type: Type;

	extraTypes?: Type[];

	required: boolean;

	positional?: number;

	description?: string;

	aliases: string[];

	hidden: boolean;

	format?: string;

	enum?: (string | number | boolean | null)[];
}

function isValidatableEnum(
	val: JsonValue | undefined,
): val is (string | number | boolean | null)[] {
	if (!Array.isArray(val)) {
		return false;
	}

	const validTypes = new Set(['string', 'number', 'boolean']);
	return val.every(item => item === null || validTypes.has(typeof item));
}

/**
 * Try to dereference a $ref in the given object
 *
 * This function only supports references of the type `#/.../...` with a path relative to the root
 * of the given schema.
 */
export function tryDereference(
	obj: JsonObject,
	schema: JsonObject,
): JsonObject {
	if (typeof obj.$ref !== 'string' || !obj.$ref.startsWith('#/')) {
		return obj;
	}

	const path = obj.$ref.slice(2).split('/');
	let current = schema;
	for (let i = 0, l = path.length; i < l; i++) {
		const key = path[i]!;
		const result: JsonValue = (current as JsonObject)[key]!;

		if (result === undefined) {
			return obj;
		}

		if (!isJsonObject(result)) {
			return obj;
		}

		current = result;
	}

	if (current.$ref !== obj.$ref) {
		if (typeof obj.description === 'string') {
			return {
				...tryDereference(current, schema),
				description: obj.description,
			};
		}

		return tryDereference(current, schema);
	}

	return obj;
}

export async function parseSchema({
	description,
	schema = true,
}: {
	description?: string;
	schema?: json.schema.JsonSchema;
}): Promise<{
	options: Option[];
	allowExtraOptions: boolean;
	description?: string;
}> {
	if (typeof schema === 'boolean') {
		return {
			options: [],
			allowExtraOptions: schema,
		};
	}

	const {required} = schema;
	let {properties = {}, additionalProperties} = schema;

	const requiredProperties = new Set<string>();
	if (Array.isArray(required)) {
		for (const r of required) {
			if (typeof r === 'string') {
				requiredProperties.add(r);
			}
		}
	}

	if (typeof additionalProperties !== 'boolean') {
		additionalProperties = true;
	}

	if (!isJsonObject(properties)) {
		properties = {};
	}

	return {
		options: (
			await Promise.all(
				Object.entries(properties).map(async ([name, property]) => {
					if (!isJsonObject(property)) {
						return null;
					}

					property = tryDereference(property, schema);

					const required = requiredProperties.has(name);
					const rawTypes = (
						await import('@angular-devkit/core')
					).json.schema.getTypesOfSchema(property);
					const types: Type[] = [];

					for (const rawType of rawTypes) {
						switch (rawType) {
							case 'string':
								types.push(Type.String);
								break;
							case 'boolean':
								types.push(Type.Boolean);
								break;
							case 'integer':
							case 'number':
								types.push(Type.Number);
								break;
							case 'array':
								if (isJsonObject(property.items!)) {
									const items = tryDereference(property.items, schema);
									if (
										items.type === 'string' ||
										(isJsonArray(items.oneOf) &&
											items.oneOf.some(
												item =>
													isJsonObject(item) &&
													tryDereference(item, schema).type === 'string',
											))
									) {
										types.push(Type.StringArray);
										break;
									}
								}

								types.push(Type.Object);
								break;
							case 'object':
								types.push(Type.Object);
								break;
						}
					}

					if (types.length === 0) {
						// Not a viable type for an option
						return null;
					}

					const type = types.shift()!;

					const aliases = isJsonArray(property.aliases)
						? property.aliases.map(x => String(x))
						: property.alias
						? [String(property.alias)]
						: [];

					const $defaultIndex =
						isJsonObject(property.$default) &&
						property.$default.$source == 'argv'
							? property.$default.index
							: undefined;
					const positional: number | undefined =
						typeof $defaultIndex == 'number' ? $defaultIndex : undefined;

					const visible =
						property.visible === undefined || property.visible === true;
					const hidden =
						!!property.hidden || !!property['x-deprecated'] || !visible;

					const description =
						typeof property.description === 'string'
							? property.description
							: undefined;

					const format =
						typeof property.format === 'string' ? property.format : undefined;

					const _enum = isValidatableEnum(property.enum)
						? property.enum
						: undefined;

					return {
						aliases,
						extraTypes: types,
						hidden,
						name,
						required,
						type,
						positional,
						description,
						format,
						enum: _enum,
					};
				}),
			)
		).filter(isNotNull),
		allowExtraOptions: additionalProperties,
		description,
	};
}
