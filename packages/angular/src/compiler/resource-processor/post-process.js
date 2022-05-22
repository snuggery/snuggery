import autoprefixer from 'autoprefixer';
import postcss from 'postcss';

import {getBrowserslist} from './browserslist.js';

/**
 * @param {string | {toString(): string}} style
 * @param {string} filename
 * @returns {Promise<{css: string}>}
 */
export async function postProcess(style, filename) {
	return await postcss(
		autoprefixer({
			overrideBrowserslist: getBrowserslist(filename),
		}),
	).process(style, {from: undefined, map: false});
}
