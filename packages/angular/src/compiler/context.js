import {createCompileCache} from './compile.js';

const globalCompileCache = createCompileCache();

/**
 * @typedef {object} EntryPoint
 * @property {string} manifestFile
 * @property {import('./manifest.js').Manifest} manifest
 * @property {string} packageName
 * @property {string} mainFile
 * @property {string} outputFolder
 * @property {string=} tsConfigFile
 * @property {string=} apiReportFile
 */

/**
 * @template {EntryPoint} [T=EntryPoint]
 */
export class BuildContext {
	/** @readonly @type {T} */
	primaryEntryPoint;

	/** @readonly @type {readonly [T, ...T[]]} */
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
	 * @param {T} input.primaryEntryPoint
	 * @param {readonly [T, ...T[]]} input.entryPoints
	 * @param {(import('./compile.js').CompileCache) | boolean} [input.compileCache]
	 * @param {import('./logger.js').Logger} input.logger
	 * @param {readonly import('./plugin.js').WrappedPlugin[]} input.plugins
	 * @param {import('./resource-processor.js').ResourceProcessor} input.resourceProcessor
	 */
	constructor({
		rootFolder,
		primaryEntryPoint,
		entryPoints,
		compileCache = true,
		logger,
		plugins,
		resourceProcessor,
	}) {
		this.rootFolder = rootFolder;
		this.primaryEntryPoint = primaryEntryPoint;
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
