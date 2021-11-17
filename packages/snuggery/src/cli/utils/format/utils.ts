export function trimNewlines(text: string): string {
	return text.replace(/^\n+|\n\s*$/, '');
}

export function stripIndent(text: string): string {
	// remove the shortest leading indentation from each line
	const match = text.match(/^[ \t]*(?=\S)/gm);

	// return early if there's nothing to strip
	if (match === null) {
		return text;
	}

	const indent = Math.min(...match.map(el => el.length));

	return (
		indent > 0
			? text.replace(new RegExp('^[ \\t]{' + indent + '}', 'gm'), '')
			: text
	).trim();
}

export function indentBy(indentation: number, text: string): string {
	const prefix = ' '.repeat(indentation);

	return prefix + stripIndent(text).replace(/\n(?=[^\n])/g, '\n' + prefix);
}

export function splitLines(maxLength: number, text: string): string[] {
	return text.match(new RegExp(`(.{1,${maxLength}})(?: |$)`, 'g')) ?? [text];
}
