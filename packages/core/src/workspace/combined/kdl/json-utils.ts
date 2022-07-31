import {isJsonArray, JsonObject, JsonValue} from '../../types';

export type JsonPrimitive = Exclude<JsonValue, JsonObject | JsonValue[]>;

export function isPrimitive(value: JsonValue): value is JsonPrimitive {
	return value == null || typeof value !== 'object';
}

export function isArrayOfPrimitives(
	value: JsonValue,
): value is JsonPrimitive[] {
	return isJsonArray(value) && value.every(item => isPrimitive(item));
}
