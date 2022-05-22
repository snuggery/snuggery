import browserslist from 'browserslist';

import {memoize} from '../utils.js';

// Defaults for browserslist that match the Angular browser support matrix
const defaults = [
	'last 1 Chrome version',
	'last 1 Firefox version',
	'last 2 Edge major versions',
	'last 2 Safari major versions',
	'last 2 iOS major versions',
	'Firefox ESR',
];

export const getBrowserslist = memoize(
	/** @param {string} path */ path =>
		browserslist(browserslist.loadConfig({path}) ?? defaults, {path}),
);
