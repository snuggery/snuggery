import {
	parse,
	modify,
	applyEdits,
	ParseError,
	printParseErrorCode,
	FormattingOptions,
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
		const indentations = new Set(
			// prettier-ignore
			source.match(
				/*
				   /                               /gm | find all matches & go line by line
				    ^(?!\r?\n)                         | match from the start of a line where the line doesn't start with an EOL (i.e. an empty line)
				              [\s]+?                   | find all whitespace, non-eagerly
				                    (?=\r?\n|[^\s])    | until the end of a line a non-space character is reached
				*/ /^(?!\r?\n)[\s]+?(?=\r?\n|[^\s])/gm
			),
		);

		const shortestIndentation =
			indentations.size > 0
				? Array.from(indentations).reduce((a, b) =>
						a.length < b.length ? a : b,
				  )
				: '  ';

		const formattingOptions: FormattingOptions = {
			insertSpaces: shortestIndentation[0] === ' ',
			tabSize: shortestIndentation.length,
			insertFinalNewline: true,
		};

		for (const change of changes) {
			let edits;

			switch (change.type) {
				case ChangeType.Add:
					edits = modify(source, change.path, change.value, {
						isArrayInsertion: true,
						formattingOptions,
					});
					break;
				case ChangeType.Modify:
					edits = modify(source, change.path, change.value, {
						formattingOptions,
					});
					break;
				case ChangeType.Delete:
					edits = modify(source, change.path, undefined, {formattingOptions});
					break;
			}

			source = applyEdits(source, edits);
		}

		return source;
	}
}
