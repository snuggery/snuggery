// Heavily based on clipanion's `formatMarkdownish` function
// https://github.com/arcanis/clipanion/blob/171eb7f7e26d17c7469348a902ef105563edbd93/sources/format.ts

import {indentBy, splitLines, stripIndent} from './utils';

const DEFAULT_MAX_LINE_LENGTH = 80;

/**
 * Formatting to include in the markdown
 */
export interface Format {
	/**
	 * Returns the given string in bold
	 *
	 * The printed length of the string shouldn't change
	 */
	bold(str: string): string;

	/**
	 * Returns the given string marked as code block
	 *
	 * The printed length of the string shouldn't change
	 */
	code(str: string): string;
}

export function formatMarkdownish(
	text: string,
	{
		format = {},
		indentation = 0,
		maxLineLength = DEFAULT_MAX_LINE_LENGTH,
	}: {
		readonly format?: Partial<Format>;
		readonly indentation?: number;
		readonly maxLineLength?: number;
	} = {},
): string {
	// Enforce \n as newline character
	text = text.replace(/\r\n?/g, '\n');

	// Remove the indentation, in case this is a multiline string that contains
	// indentation due to its place in code.
	text = stripIndent(text);

	// List items always end with two spaces (in order not to be collapsed)
	text = text.replace(/^-([^\n]*?)\n+/gm, '-$1  \n');

	// Collapse single newlines, unless the line ends with two spaces
	text = text.replace(/( {2})?(?<!\n)\n(?!\n)/g, (_, insertNewline) =>
		insertNewline ? '\n' : ' ',
	);

	// Collapse multiple newlines into two
	text = text.replace(/\n\n+/g, '\n\n');

	if (Number.isFinite(maxLineLength)) {
		maxLineLength = Math.max(maxLineLength, indentation + 10);

		text = text
			.split(/\n/)
			.map(paragraph => {
				// Does the paragraph starts with a list?
				const bulletMatch = paragraph.match(/^[*-][\t ]+(.*)/);

				if (!bulletMatch)
					// No, cut the paragraphs into segments of 80 characters
					return splitLines(maxLineLength - indentation, paragraph)
						.map(line => line.trimEnd())
						.join('\n');

				// Yes, cut the paragraphs into segments of 78 characters (to account for the prefix)
				return splitLines(maxLineLength - 2 - indentation, bulletMatch[1]!)
					.map((line, index) => {
						return (index === 0 ? '- ' : '  ') + line.trimEnd();
					})
					.join('\n');
			})
			.join('\n');
	}

	// Highlight the `code` segments
	if (format.code != null) {
		text = text.replace(/(`+)((?:.|[\n])*?)\1/g, (_, $1, $2) => {
			return format.code!($1 + $2 + $1);
		});
	}

	// Support **bold**
	if (format.bold != null) {
		text = text.replace(/(\*\*)((?:.|[\n])*?)\1/g, (_, $1, $2) => {
			return format.bold!($1 + $2 + $1);
		});
	}

	return indentation ? indentBy(indentation, text) : text;
}
