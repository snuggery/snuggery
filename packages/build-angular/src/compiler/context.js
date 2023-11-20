/* cspell:ignore fesm */

import {createCompileCache} from './compile.js';

const globalCompileCache = createCompileCache();

/**
 * @template [T=unknown]
 * @typedef {object} EntryPoint
 * @property {string} packageName
 * @property {string} exportName
 * @property {string} mainFile
 * @property {T} esmFile
 * @property {T} declarationFile
 * @property {string} fesmFile
 */

/**
 * @template [T=unknown]
 */
export class BuildContext {
	/** @readonly @type {import('./manifest.js').Manifest} */
	manifest;

	/** @readonly @type {readonly [EntryPoint<T>, ...EntryPoint<T>[]]} */
	entryPoints;

	/** @readonly @type {import('./compile.js').CompileCache} */
	compileCache;

	/** @readonly @type {string} */
	rootFolder;

	/** @readonly @type {import('./logger.js').Logger} */
	logger;

	/** @readonly @type {readonly import('./plugin.js').WrappedPlugin[]} */
	plugins;

	/** @readonly @type {import('./resource-processor.js').ResourceProcessor} */
	resourceProcessor;

	/**
	 * @param {object} input
	 * @param {string} input.rootFolder
	 * @param {import('./manifest.js').Manifest} input.manifest
	 * @param {readonly [EntryPoint<T>, ...EntryPoint<T>[]]} input.entryPoints
	 * @param {(import('./compile.js').CompileCache) | boolean} [input.compileCache]
	 * @param {import('./logger.js').Logger} input.logger
	 * @param {readonly import('./plugin.js').WrappedPlugin[]} input.plugins
	 * @param {import('./resource-processor.js').ResourceProcessor} input.resourceProcessor
	 */
	constructor({
		rootFolder,
		manifest,
		entryPoints,
		compileCache = true,
		logger,
		plugins,
		resourceProcessor,
	}) {
		this.rootFolder = rootFolder;
		this.manifest = manifest;
		this.entryPoints = entryPoints;
		this.logger = logger;
		this.plugins = plugins;
		this.resourceProcessor = resourceProcessor;

		this.compileCache =
			typeof compileCache === 'boolean'
				? compileCache
					? globalCompileCache
					: createCompileCache()
				: compileCache;
	}
}
