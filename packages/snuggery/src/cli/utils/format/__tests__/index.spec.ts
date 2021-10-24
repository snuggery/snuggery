import {formatMarkdownish} from '../index';

function reverse(text: string): string {
	return Array.from(text).reverse().join('');
}

describe('formatMarkdownish', () => {
	const texts = [
		'lorem',

		// should collapse
		'lorem\nipsum',

		// should not collapse
		'lorem  \nipsum',
		'lorem\n\nipsum',

		// Lists

		'- lorem\n- ipsum\n- dolor',
		'- lorem ipsum dolor sit amet, the quick brown fox jumps over the lazy dog\n- ipsum\n- dolor sit amet, the lazy dog is jumped over by the quick brown fox',

		// Code
		'`a code` block',
		"what happens when a code block is split over multiple lines? `let's find out shan't we?`",

		// Bold
		'**bold** text',
		"what happens when bold text is split over multiple lines? **let's find out shan't we?**",

		// Pre-indented (spaces & tabs)
		`
      This text is already
      indented because it's
      multiline and part of
      a section of real code.
    `,
		`
			This text is already
			indented because it's
			multiline and part of
			a section of real code.
		`,
	];

	it('should format correctly', () => {
		for (const text of texts) {
			expect(formatMarkdownish(text)).toMatchSnapshot();
		}
	});

	it('should format correctly with infinite line length', () => {
		for (const text of texts) {
			expect(
				formatMarkdownish(text, {maxLineLength: Infinity}),
			).toMatchSnapshot();
		}
	});

	it('should format correctly with indentation', () => {
		for (const text of texts) {
			expect(formatMarkdownish(text, {indentation: 2})).toMatchSnapshot();
			expect(formatMarkdownish(text, {indentation: 20})).toMatchSnapshot();
		}
	});

	it('should format correctly with format', () => {
		for (const text of texts) {
			expect(
				formatMarkdownish(text, {
					format: {
						bold: reverse,
					},
				}),
			).toMatchSnapshot();

			expect(
				formatMarkdownish(text, {
					format: {
						code: reverse,
					},
				}),
			).toMatchSnapshot();
		}
	});
});
