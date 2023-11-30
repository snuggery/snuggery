import {JsonPropertyPath, stringifyPath} from "./json";

export class InvalidConfigurationError extends Error {
	readonly clipanion = {type: "none"} as const;

	constructor(message: string, path: JsonPropertyPath = []) {
		super(`${message} at ${stringifyPath(path)}`);
		this.name = this.constructor.name;
	}
}

export class UnsupportedOperationError extends Error {
	readonly clipanion = {type: "none"} as const;

	constructor(message: string) {
		super(message);
		this.name = this.constructor.name;
	}
}
