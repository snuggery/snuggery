// Heavily based on clipanion's `formatMarkdownish` function
// https://github.com/arcanis/clipanion/blob/171eb7f7e26d17c7469348a902ef105563edbd93/sources/format.ts

import type {ColorFormat} from 'clipanion';

function stripIndent(text: string): string {
	// remove the shortest leading indentation from each line
	const match = text.match(/^[ \t]*(?=\S)/gm);

	// return early if there's nothing to strip
	if (match === null) {
		return text;
	}

	const indent = Math.min(...match.map((el) => el.length));

	return (
		indent > 0
			? text.replace(new RegExp('^[ \\t]{' + indent + '}', 'gm'), '')
			: text
	).trim();
}

function indentBy(indentation: number, text: string): string {
	const prefix = ' '.repeat(indentation);

	return prefix + stripIndent(text).replace(/\n(?=[^\n])/g, '\n' + prefix);
}

function splitLines(maxLength: number, text: string): string[] {
	return text.match(new RegExp(`(.{1,${maxLength}})(?: |$)`, 'g')) ?? [text];
}

const DEFAULT_MAX_LINE_LENGTH = 80;

export function formatMarkdownish(
	text: string,
	{
		format = {},
		indentation = 0,
		maxLineLength = DEFAULT_MAX_LINE_LENGTH,
	}: {
		readonly format?: Partial<ColorFormat>;
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
	text = text.replace(/^-([^\n]*?)\n(?:\n*(?=-))?/gm, '-$1  \n');

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
			.map((paragraph) => {
				// Does the paragraph starts with a list?
				const bulletMatch = paragraph.match(/^[*-][\t ]+(.*)/);

				if (!bulletMatch)
					// No, cut the paragraphs into segments of 80 characters
					return splitLines(maxLineLength - indentation, paragraph)
						.map((line) => line.trimEnd())
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
