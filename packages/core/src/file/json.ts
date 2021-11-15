import {
	parse,
	modify,
	applyEdits,
	ParseError,
	printParseErrorCode,
} from 'jsonc-parser';
import {basename} from 'path';

import {makeCombinedTracker, ChangeType} from '../proxy';
import {InvalidConfigurationError, isJsonObject, JsonObject} from '../types';

import type {WorkspaceHost, FileHandle} from './types';

function processParseErrors(errors: readonly ParseError[]) {
	if (errors.length === 1) {
		const [error] = errors as [ParseError];
		throw new InvalidConfigurationError(
			`Error while parsing JSON file: ${printParseErrorCode(error.error)} at ${
				error.offset
			}`,
		);
	} else if (errors.length > 0) {
		throw new InvalidConfigurationError(
			`Errors while parsing JSON file:\n- ${errors
				.map(error => `printParseErrorCode(error.error)} at ${error.offset}`)
				.join('\n- ')}`,
		);
	}
}

export class JsonFileHandle implements FileHandle {
	readonly #source: WorkspaceHost;
	readonly #path: string;

	readonly filename: string;

	constructor(source: WorkspaceHost, path: string) {
		this.#source = source;
		this.#path = path;

		this.filename = basename(path);
	}

	async read(): Promise<JsonObject> {
		const errors: ParseError[] = [];
		const value = parse(await this.#source.read(this.#path), errors, {
			allowEmptyContent: true,
			allowTrailingComma: true,
			disallowComments: false,
		});

		processParseErrors(errors);

		if (!isJsonObject(value)) {
			throw new InvalidConfigurationError('Configuration must be an object');
		}

		return value;
	}

	async write(value: JsonObject): Promise<void> {
		await this.#source.write(this.#path, JSON.stringify(value, null, 2));
	}

	async update(
		updater: (value: JsonObject) => void | Promise<void>,
	): Promise<void> {
		const errors: ParseError[] = [];
		const source = await this.#source.read(this.#path);
		const value = parse(source, errors, {
			allowEmptyContent: true,
			allowTrailingComma: true,
			disallowComments: false,
		});

		processParseErrors(errors);

		if (!isJsonObject(value)) {
			throw new InvalidConfigurationError(
				`Configuration must be an object, got ${JSON.stringify(
					value,
				)} from ${source}`,
			);
		}

		const changes = await makeCombinedTracker(value).open(updater);

		let currentSource = source;

		for (const change of changes) {
			let edits;

			switch (change.type) {
				case ChangeType.Add:
					edits = modify(currentSource, change.path, change.value, {
						isArrayInsertion: true,
					});
					break;
				case ChangeType.Modify:
					edits = modify(currentSource, change.path, change.value, {});
					break;
				case ChangeType.Delete:
					edits = modify(currentSource, change.path, undefined, {});
					break;
			}

			currentSource = applyEdits(currentSource, edits);
		}

		await this.#source.write(this.#path, currentSource);
	}
}
