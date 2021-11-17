// cspell:ignore edoc unexpand dnif ntuo t'nahs dlob

import {tags} from '@angular-devkit/core';
import expect from 'expect';
import {suite} from 'uvu';

import {formatMarkdownish} from '../index';

function stripIndent(strings: TemplateStringsArray, ...values: unknown[]) {
	return tags
		.stripIndent(strings, ...values)
		.replace(/\t/g, '  ')
		.trim();
}

function indent(width: number | string, value: string) {
	const indentation = typeof width === 'string' ? width : ' '.repeat(width);
	return `${indentation}${value.replace(/\n(?=[^\n])/g, `\n${indentation}`)}`;
}

function reverse(text: string): string {
	return Array.from(text).reverse().join('');
}

const test = suite('formatMarkdownish');

const texts = [
	{
		input: 'lorem',
		formatted: 'lorem',
	},

	// should collapse
	{
		input: 'lorem\nipsum',
		formatted: 'lorem ipsum',
	},

	// should not collapse
	{
		input: 'lorem  \nipsum',
		formatted: 'lorem\nipsum',
	},
	{
		input: 'lorem\n\nipsum',
		formatted: 'lorem\n\nipsum',
	},

	// Lists
	{
		input: stripIndent`
			- lorem
			- ipsum
			- dolor
		`,
		formatted: stripIndent`
			- lorem
			- ipsum
			- dolor
		`,
	},
	{
		input: stripIndent`
			- lorem ipsum dolor sit amet, the quick brown fox jumps over the lazy dog
			- ipsum
			- dolor sit amet, the lazy dog is jumped over by the quick brown fox
		`,
		formatted: stripIndent`
			- lorem ipsum dolor sit amet, the quick brown fox jumps over the lazy dog
			- ipsum
			- dolor sit amet, the lazy dog is jumped over by the quick brown fox
		`,
		formattedIndent20: indent(
			20,
			stripIndent`
			- lorem ipsum dolor sit amet, the quick brown fox jumps over
			  the lazy dog
			- ipsum
			- dolor sit amet, the lazy dog is jumped over by the quick
				brown fox
		`,
		),
	},

	// Code
	{
		input: '`a code` block',
		formatted: '`a code` block',
		formattedReverseCode: '`edoc a` block',
	},
	{
		input:
			"what happens when a code block is split over multiple lines? `let's find out shan't we?`",
		formatted:
			"what happens when a code block is split over multiple lines? `let's find out\nshan't we?`",
		formattedInfinite:
			"what happens when a code block is split over multiple lines? `let's find out shan't we?`",
		formattedIndent20: indent(
			20,
			stripIndent`
				what happens when a code block is split over multiple lines?
				${'`'}let's find out shan't we?${'`'}
			`,
		),
		formattedReverseCode:
			"what happens when a code block is split over multiple lines? `?ew t'nahs\ntuo dnif s'tel`",
	},

	// Bold
	{
		input: '**bold** text',
		formatted: '**bold** text',
		formattedReverseBold: '**dlob** text',
	},
	{
		input:
			"what happens when bold text is split over multiple lines? **let's find out shan't we?**",
		formatted:
			"what happens when bold text is split over multiple lines? **let's find out\nshan't we?**",
		formattedInfinite:
			"what happens when bold text is split over multiple lines? **let's find out shan't we?**",
		formattedIndent20: indent(
			20,
			stripIndent`
				what happens when bold text is split over multiple lines?
				**let's find out shan't we?**
			`,
		),
		formattedReverseBold:
			"what happens when bold text is split over multiple lines? **?ew t'nahs\ntuo dnif s'tel**",
	},

	// Pre-indented (spaces & tabs)
	{
		input: indent(
			2,
			stripIndent`
				This text is already
				indented because it's
				multiline and part of
				a section of real code.
			`,
		),
		formatted: stripIndent`
			This text is already indented because it's multiline and part of a section of
			real code.
		`,
		formattedInfinite:
			"This text is already indented because it's multiline and part of a section of real code.",
		formattedIndent20: indent(
			20,
			stripIndent`
				This text is already indented because it's multiline and
				part of a section of real code.
			`,
		),
	},
	{
		input: indent(
			'\t',
			stripIndent`
				This text is already
				indented because it's
				multiline and part of
				a section of real code.
			`,
		),
		formatted: stripIndent`
			This text is already indented because it's multiline and part of a section of
			real code.
		`,
		formattedInfinite:
			"This text is already indented because it's multiline and part of a section of real code.",
		formattedIndent20: indent(
			20,
			stripIndent`
				This text is already indented because it's multiline and
				part of a section of real code.
			`,
		),
	},
];

test('it formats correctly', () => {
	for (const {input, formatted} of texts) {
		expect(formatMarkdownish(input)).toBe(formatted);
	}
});

test('it formats correctly with infinite line length', () => {
	for (const {input, formatted, formattedInfinite} of texts) {
		expect(formatMarkdownish(input, {maxLineLength: Infinity})).toBe(
			formattedInfinite ?? formatted,
		);
	}
});

test('it formats correctly with indentation', () => {
	for (const {input, formatted, formattedIndent20} of texts) {
		expect(formatMarkdownish(input, {indentation: 20})).toBe(
			formattedIndent20 ?? indent(20, formatted),
		);
	}
});

test('it formats correctly with format', () => {
	for (const {
		input,
		formattedReverseBold,
		formattedReverseCode,
		formatted,
	} of texts) {
		expect(
			formatMarkdownish(input, {
				format: {
					bold: reverse,
				},
			}),
		).toBe(formattedReverseBold ?? formatted);

		expect(
			formatMarkdownish(input, {
				format: {
					code: reverse,
				},
			}),
		).toBe(formattedReverseCode ?? formatted);
	}
});

test('it handles lists properly', () => {
	expect(
		formatMarkdownish(stripIndent`
			- one

			- two
			- three
		`),
	).toBe(stripIndent`
		- one
		- two
		- three
	`);

	expect(
		formatMarkdownish(stripIndent`
			test

			- one

			- two

			- three

			test
		`),
	).toBe(stripIndent`
		test

		- one
		- two
		- three

		test
	`);
});

test.run();
