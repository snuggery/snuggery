import * as path from 'node:path';

/**
 * @param {string} moduleSpecifier
 * @returns {string}
 */
export function getPackageName(moduleSpecifier) {
	const firstSlash = moduleSpecifier.indexOf('/');

	if (firstSlash === -1) {
		return moduleSpecifier;
	}

	if (!moduleSpecifier.startsWith('@')) {
		return moduleSpecifier.slice(0, firstSlash);
	}

	const secondSlash = moduleSpecifier.indexOf('/', firstSlash + 1);
	return secondSlash === -1
		? moduleSpecifier
		: moduleSpecifier.slice(0, secondSlash);
}

/**
 * @param {string} moduleSpecifier
 * @returns {string}
 */
export function getUnscopedName(moduleSpecifier) {
	return moduleSpecifier.slice(moduleSpecifier.lastIndexOf('/') + 1);
}

const PATH_REGEXP = new RegExp('\\' + path.sep, 'g');

/**
 * @type {<T extends string | null>(path: T) => T}
 */
export const ensureUnixPath =
	path.sep !== path.posix.sep
		? (p) => {
				if (typeof p !== 'string') {
					return /** @type {typeof p} */ (null);
				}

				// we use a regex instead of the character literal due to a bug in some versions of node.js
				// the path separator needs to be preceded by an escape character
				return /** @type {typeof p} */ (p.replace(PATH_REGEXP, path.posix.sep));
		  }
		: (path) => path;

/**
 * @template K, V
 * @param {Map<K, V>} map
 * @param {K} key
 * @param {(key: K) => V} factory
 */
export function getOrCreate(map, key, factory) {
	let value = map.get(key);
	if (value === undefined) {
		value = factory(key);
		map.set(key, value);
	}

	return value;
}

/**
 * @template K, V
 * @param {(value: K) => V} fn
 * @returns {(value: K) => V}
 */
export function memoize(fn) {
	/** @type {Map<K, V>} */
	const cache = new Map();

	return (key) => getOrCreate(cache, key, fn);
}
