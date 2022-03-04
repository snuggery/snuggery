import {
	parse,
	modify,
	applyEdits,
	ParseError,
	printParseErrorCode,
} from 'jsonc-parser';

import {ChangeType, Change} from '../proxy';
import {InvalidConfigurationError, isJsonObject, JsonObject} from '../types';

import {AbstractFileHandle} from './abstract';

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
				.map(error => `${printParseErrorCode(error.error)} at ${error.offset}`)
				.join('\n- ')}`,
		);
	}
}

export class JsonFileHandle extends AbstractFileHandle<JsonObject> {
	parse(source: string): JsonObject {
		const errors: ParseError[] = [];
		const value = parse(source, errors, {
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

	getValue(value: JsonObject): JsonObject {
		return value;
	}

	stringify(value: JsonObject): string {
		return JSON.stringify(value, null, 2);
	}

	applyChanges(
		source: string,
		_value: JsonObject,
		changes: readonly Change[],
	): string {
		for (const change of changes) {
			let edits;

			switch (change.type) {
				case ChangeType.Add:
					edits = modify(source, change.path, change.value, {
						isArrayInsertion: true,
					});
					break;
				case ChangeType.Modify:
					edits = modify(source, change.path, change.value, {});
					break;
				case ChangeType.Delete:
					edits = modify(source, change.path, undefined, {});
					break;
			}

			source = applyEdits(source, edits);
		}

		return source;
	}
}
