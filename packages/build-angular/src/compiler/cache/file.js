import {getOrCreate} from '../utils.js';

/**
 * @typedef {object} File
 * @property {boolean=} exists
 * @property {import('typescript').SourceFile=} sourceFile
 * @property {string=} content
 * @property {Map<string, string>=} processedResource
 */

/**
 * @returns {File}
 */
function createFile() {
	return {
		exists: undefined,
		sourceFile: undefined,
		content: undefined,
		processedResource: undefined,
	};
}

export class FileCache {
	/** @type {Map<string, File>} */
	#cache = new Map();

	/**
	 * @param {string} path
	 * @returns {File}
	 */
	get(path) {
		return getOrCreate(this.#cache, path, createFile);
	}
}
