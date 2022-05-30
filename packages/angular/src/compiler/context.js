import {createCompileCache} from './compile.js';

const globalCompileCache = createCompileCache();

/**
 * @typedef {object} EntryPoint
 * @property {string} packageName
 * @property {string} mainFile
 * @property {string} outputFolder
 * @property {string=} tsConfigFile
 * @property {string=} apiReportFile
 */

/**
 * @typedef {object} _PackageEntryPoint
 * @property {string} manifestFile
 * @property {import('./manifest.js').Manifest} manifest
 */

/**
 * @typedef {EntryPoint & _PackageEntryPoint} PackageEntryPoint
 */

/**
 * @param {EntryPoint} entryPoint
 * @returns {entryPoint is PackageEntryPoint}
 */
function isPackageEntryPoint(entryPoint) {
	return 'manifest' in entryPoint;
}

/**
 * @template {EntryPoint} [E=EntryPoint]
 * @template {PackageEntryPoint} [PE=PackageEntryPoint]
 */
export class BuildContext {
	/** @readonly @type {PE} */
	primaryEntryPoint;

	/** @readonly @type {readonly [PE, ...E[]]} */
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
	 * @param {PE} input.primaryEntryPoint
	 * @param {readonly [PE, ...E[]]} input.entryPoints
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

	/**
	 * @param {E} currentEntryPoint
	 * @returns {import('./manifest.js').Manifest}
	 */
	getManifest(currentEntryPoint) {
		return isPackageEntryPoint(currentEntryPoint)
			? currentEntryPoint.manifest
			: this.primaryEntryPoint.manifest;
	}
}
