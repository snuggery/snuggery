import {transform} from 'esbuild';

import {getBrowserslist} from './browserslist.js';

// https://esbuild.github.io/api/#target
const esbuildBrowserNames = new Set([
	'chrome',
	'edge',
	'firefox',
	// Angular doesn't support Internet Explorer
	// 'ie',
	'ios',
	'opera',
	'safari',
]);

/**
 * Map browser names from browserslist to their corresponding names in esbuild
 */
const browserRenames = new Map([['ios_saf', 'ios']]);

/**
 * @param {readonly string[]} browsers
 * @returns {string[] | undefined}
 */
function browserslistToEsbuild(browsers) {
	/** @type {string[]} */
	const transformed = [];

	for (const browser of browsers) {
		// browser is of the form '<browser> <version or range>'
		// e.g. 'edge 100', 'safari 15.2-15.3'
		const match = /^(?<browserName>[^ ]+) (?<version>[^-]+)(?:-|$)/.exec(
			browser,
		);
		if (!match) {
			continue;
		}

		let {browserName, version} =
			/** @type {{browserName: string; version: string}} */ (match.groups);

		// rename the browser to whatever esbuild uses
		browserName = browserRenames.get(browserName) ?? browserName;
		if (!esbuildBrowserNames.has(browserName)) {
			continue;
		}

		if (browserName === 'safari' && version === 'TP') {
			// esbuild uses numbers, map the Technology Preview onto a high enough number to
			// represent a version higher than any existing safari version
			version = '100';
		}

		transformed.push(`${browserName}${version}`);
	}

	return transformed.length ? transformed : undefined;
}

/**
 * @param {string} style
 * @param {string} filename
 */
export async function optimizeStyle(style, filename) {
	const {code} = await transform(style, {
		loader: 'css',
		minify: true,
		target: browserslistToEsbuild(getBrowserslist(filename)),
	});

	return {css: code};
}
