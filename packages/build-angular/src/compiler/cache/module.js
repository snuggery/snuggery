/**
 * @typedef {object} Module
 * @property {Set<string>} moduleNames
 * @property {Set<Module>} parents
 */

import path, {extname, posix} from "node:path";

import {memoize} from "../utils.js";

/**
 * @param {string} moduleName
 */
const isBareModuleSpecifier = memoize(
	function isBareModuleSpecifier(moduleName) {
		return (
			!moduleName.startsWith("./") &&
			!moduleName.startsWith("../") &&
			!posix.isAbsolute(moduleName) &&
			(path === posix || !path.isAbsolute(moduleName))
		);
	},
);

export class ModuleCache {
	/** @type {Map<string, Module>} */
	#cache = new Map();

	/**
	 * @param {string} importedFilePath
	 * @param {string|undefined} containingFilePath
	 * @param {string} moduleName
	 * @returns {void}
	 */
	set(importedFilePath, containingFilePath, moduleName) {
		let cached = this.#cache.get(importedFilePath);
		if (cached == null) {
			cached = {
				moduleNames: new Set(),
				parents: new Set(),
			};
			this.#cache.set(importedFilePath, cached);

			if (!/\.d\.[cm]?tsx?/.test(importedFilePath)) {
				const extension = extname(importedFilePath);
				if (extension) {
					this.#cache.set(importedFilePath.slice(0, -extension.length), cached);
				}
			}
		}

		if (isBareModuleSpecifier(moduleName)) {
			cached.moduleNames.add(moduleName);
		} else {
			const parent =
				containingFilePath != null ? this.#cache.get(containingFilePath) : null;
			if (parent != null) {
				cached.parents.add(parent);
			}
		}
	}

	/**
	 * Return a bare specifier that imports the requested path
	 *
	 * While there is absolutely no guarantee that the returned bare
	 * module exports anything from the importedFilePath, this happens
	 * to be true for all APF packages as they're bundled into single files.
	 *
	 * This function is only used to generate extra imports for modules
	 * and components, which implies all targets are angular packages.
	 * Those should all be built to the APF description.
	 *
	 * @param {string} importedFilePath
	 * @returns {string=}
	 */
	get(importedFilePath) {
		const cached = this.#cache.get(importedFilePath);
		if (cached == null) {
			return undefined;
		}

		const process = [cached];
		let current;
		const processed = new Set();
		while ((current = process.shift())) {
			if (processed.has(current)) {
				continue;
			}

			const moduleNames = Array.from(current.moduleNames);
			if (moduleNames.length > 0) {
				return moduleNames[0];
			}

			processed.add(current);
			process.push(...current.parents);
		}

		return undefined;
	}
}
