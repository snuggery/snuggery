export type JsonValue =
	| null
	| boolean
	| string
	| number
	| JsonValue[]
	| JsonObject;

export interface JsonObject {
	[key: string]: JsonValue;
}

export type JsonPropertyName = string | number;

export type JsonPropertyPath = JsonPropertyName[];

export function isJsonArray(
	value: JsonValue | undefined,
): value is JsonValue[] {
	return Array.isArray(value);
}

export function isJsonObject(
	value: JsonValue | undefined,
): value is JsonObject {
	return typeof value === 'object' && value != null && !Array.isArray(value);
}

export function getPrintableType(value: JsonValue | undefined): string {
	if (value == null) {
		return String(value);
	}

	if (typeof value !== 'object') {
		return `a ${typeof value}`;
	}

	return Array.isArray(value) ? 'an array' : 'an object';
}

export function stringifyPath(path: JsonPropertyPath): string {
	if (path.length === 0) {
		return '<configuration file>';
	}

	return path
		.map((part, idx) => {
			if (typeof part === 'number') {
				return `[${part}]`;
			} else if (idx === 0) {
				return part;
			} else {
				return `.${part}`;
			}
		})
		.join('');
}

export class InvalidConfigurationError extends Error {
	readonly clipanion = {type: 'none'} as const;

	constructor(message: string, path: JsonPropertyPath = []) {
		super(`${message} at ${stringifyPath(path)}`);
		this.name = this.constructor.name;
	}
}
