/** cspell:ignore fesm */

import {mkdir, readFile, rm} from 'node:fs/promises';
import {dirname, join, posix, resolve} from 'node:path';
import {cwd} from 'node:process';

import {
	compile,
	createCompileCache,
	fillInCompilerOutput,
	ScriptTarget,
} from './compiler/compile.js';
import {BuildContext} from './compiler/context.js';
import {BuildFailureError} from './compiler/error.js';
import * as flags from './compiler/flags.js';
import {flattenCode} from './compiler/flatten/code.js';
import {flattenTypes} from './compiler/flatten/types.js';
import {defaultLogger} from './compiler/logger.js';
import {findEntryPoints, writeManifest} from './compiler/manifest.js';
import {performance} from './compiler/performance.js';
import {createPlugin} from './compiler/plugin.js';
import {ResourceProcessor} from './compiler/resource-processor.js';
import {ensureUnixPath, getUnscopedName} from './compiler/utils.js';

export {BuildFailureError, createCompileCache};

/**
 * @typedef {import('./compiler/plugin.js').Plugin} CompilerPlugin
 */

/**
 * Factory of plugin instances
 *
 * A plugin is loaded via its factory, which is passed into the compiler.
 *
 * @template [I=unknown]
 * @typedef {object} CompilerPluginFactory
 * @property {string} name The name of the plugin
 *
 * This name is added to logged errors to help identify the cause
 * @property {(compilerInput: Readonly<Required<Omit<CompilerInput, 'plugins'>>>, pluginInput?: I) => CompilerPlugin} create Function called to create the plugin instance, given the configuration passed to the compiler (with defaults filled in) and the input configured for the plugin, if any.
 */

/**
 * @typedef {Partial<typeof flags>} CompilerFlags
 */

/**
 * Input for the compiler
 *
 * @typedef {object} CompilerInput
 *
 * @property {string} [rootFolder] Folder to which all relative paths are resolved
 *
 * This property defaults to the current working directory.
 *
 * @property {string} manifestFile Path to the `package.json` file of this entry point, can be absolute or relative to the `rootFolder`
 *
 * This is the only required property
 *
 * @property {string} [mainFile] Main file of the entry point
 *
 * Defaults to the `package.json`'s `exports`, or `main` of the `package.json` or `index.ts` if that isn't set
 *
 * @property {string} [tsConfigFile] Path to the typescript configuration file for this package
 *
 * Defaults to a `tsconfig.json` file next to the `manifestFile`.
 *
 * This is the only required property on the input.
 *
 * @property {string} [outputFolder] The output folder
 *
 * This defaults to `<rootFolder>/dist`
 *
 * @property {boolean} [cleanOutputFolder] Whether to clean the output folder before building
 *
 * The default value is `true`
 *
 * @property {import('./compiler/compile.js').CompileCache | boolean} [cache] Config for the cache
 *
 * If `false` is passed, caching is disabled.
 * If a cache is passed, that cache will be used.
 * If `true` is passed (the default value), a global cache is used.
 *
 * @property {import('./compiler/logger.js').Logger} [logger] Logger used to output messages, warnings or errors
 *
 * Defaults to printing to the `console`.
 *
 * @property {readonly (CompilerPluginFactory<void> | readonly [CompilerPluginFactory<unknown>, unknown])[]} [plugins] Plugins to use while building
 *
 * Defaults to not using any plugins
 *
 * @property {boolean} [keepScripts] Whether to keep the `scripts` section in the `package.json` output
 *
 * Defaults to `false`.
 *
 * @property {boolean} [keepDevDependencies] Whether to keep the `devDependencies` section in the `package.json` output
 *
 * Defaults to `false`.
 *
 * @property {string} [inlineStyleLanguage] The language to use for inline styles
 *
 * The default value is `'css'`.
 *
 * @property {CompilerFlags} [flags] Compiler flags to set
 *
 * The default values for these flags can be found in the `CompilerFlags` documentation.
 */

/**
 * Output of the compiler
 *
 * @typedef {object} CompilerOutput
 *
 * @property {import('./compiler/compile.js').CompileCache} cache The cache used while building
 */

const globalCache = createCompileCache();

const targetLanguageLevel = 2022;

/**
 * Build an angular library
 *
 * @param {CompilerInput} input Configuration for the compiler
 * @returns {Promise<CompilerOutput>} The output
 */
export async function build({
	manifestFile,
	mainFile,
	tsConfigFile,
	rootFolder = cwd(),
	outputFolder = 'dist',
	cleanOutputFolder = true,
	cache = true,
	logger = defaultLogger,
	plugins: pluginFactories = [],
	keepScripts = false,
	keepDevDependencies = keepScripts,
	inlineStyleLanguage = 'css',
	flags: {
		usePrivateApiAsImportIssueWorkaround = flags.usePrivateApiAsImportIssueWorkaround,
		enableApiExtractor = flags.enableApiExtractor,
	} = {},
}) {
	rootFolder = resolve(rootFolder);
	outputFolder = resolve(rootFolder, outputFolder);

	const esmOutputFolder = join(outputFolder, `esm${targetLanguageLevel}`);
	const fesmOutputFolder = join(outputFolder, `fesm${targetLanguageLevel}`);
	const declarationOutputFolder = join(outputFolder, 'types');

	performance.mark('start');

	manifestFile = resolve(rootFolder, manifestFile);
	const manifest = /** @type {import('./compiler/manifest.js').Manifest} */ (
		JSON.parse(await readFile(manifestFile, 'utf-8'))
	);

	const mainPackageName = manifest.name;

	const entryPoints = Array.from(
		findEntryPoints(
			manifestFile,
			manifest,
			mainFile && resolve(rootFolder, mainFile),
		),
		/** @returns {import('./compiler/context.js').EntryPoint<unknown>} */
		([exportName, mainFile]) => {
			const packageName = posix.join(
				mainPackageName,
				ensureUnixPath(exportName),
			);

			return {
				packageName,
				exportName,
				mainFile,

				esmFile: null,
				fesmFile: join(fesmOutputFolder, `${getUnscopedName(packageName)}.js`),
				declarationFile: null,
			};
		},
	);

	if (!isNotEmpty(entryPoints)) {
		throw new BuildFailureError(
			`Didn't find any entry points in ${manifestFile}`,
		);
	}

	const plugins = pluginFactories.map(pluginFactoryOrArray => {
		let pluginInput = undefined;
		let pluginFactory;
		if (Array.isArray(pluginFactoryOrArray)) {
			[pluginFactory, pluginInput] = pluginFactoryOrArray;
		} else {
			pluginFactory = /** @type {CompilerPluginFactory<unknown>} */ (
				pluginFactoryOrArray
			);
		}

		return createPlugin(
			logger,
			pluginFactory.name,
			pluginFactory,
			{
				manifestFile,
				mainFile,
				tsConfigFile,
				outputFolder,
				cleanOutputFolder,
				cache,
				logger,
				keepScripts,
				keepDevDependencies,
				inlineStyleLanguage,
				flags: {enableApiExtractor, usePrivateApiAsImportIssueWorkaround},
			},
			pluginInput,
		);
	});

	// Create the build context
	const buildContext = new BuildContext({
		rootFolder,
		manifest,
		entryPoints,
		logger,
		plugins,
		compileCache:
			typeof cache === 'boolean'
				? cache
					? globalCache
					: createCompileCache()
				: cache,
		resourceProcessor: new ResourceProcessor(
			logger,
			plugins,
			inlineStyleLanguage,
		),
	});

	performance.mark('prepared');
	performance.measure('prepare', 'start', 'prepared');

	// Start with a clean slate
	if (cleanOutputFolder) {
		await rm(outputFolder, {force: true, recursive: true});
	}
	await mkdir(outputFolder, {recursive: true});

	performance.mark('cleaned');
	performance.measure('clean', 'prepared', 'cleaned');

	tsConfigFile = tsConfigFile
		? resolve(rootFolder, tsConfigFile)
		: join(dirname(manifestFile), 'tsconfig.json');

	// Start by compiling all entryPoints
	logger.info(`Building ${mainPackageName}...`);
	const compilationOutput = await compile(buildContext, {
		tsConfigFile,
		outputFolder: esmOutputFolder,
		declarationOutputFolder,
		target: ScriptTarget[`ES${targetLanguageLevel}`],
		usePrivateApiAsImportIssueWorkaround,
	});

	fillInCompilerOutput(buildContext, compilationOutput);

	performance.mark('compiled');
	performance.measure('compile', 'cleaned', 'compiled');

	// Then flatten the code
	const flattenEntryPoints =
		// It would be nice if typescript knew calling map() on [T, ...T[]] returns [U, ...U[]] and not U[]
		/** @type {[import('./compiler/flatten/code.js').EntryPoint, ...import('./compiler/flatten/code.js').EntryPoint[]]}*/ (
			buildContext.entryPoints.map(entryPoint => ({
				packageName: entryPoint.packageName,
				mainFile: entryPoint.esmFile,
				outputFile: entryPoint.fesmFile,
			}))
		);
	await flattenCode({
		entryPoints: flattenEntryPoints,
		target: `es${targetLanguageLevel}`,
		outputFolder: fesmOutputFolder,
	});

	performance.mark('code-flattened');
	performance.measure('flatten code', 'compiled', 'code-flattened');

	// And the types
	await flattenTypes(buildContext, {
		declarationOutputFolder,
		outputFolder,
		enableApiExtractor,
	});

	performance.mark('types-flattened');
	performance.measure('flatten types', 'code-flattened', 'types-flattened');

	// Finally, write the manifest
	await writeManifest(buildContext, {
		plugins,
		outputFolder,
		keepDevDependencies,
		keepScripts,
		targetLanguageLevel,
	});

	for (const plugin of plugins) {
		plugin.finalize();
	}

	return {cache: buildContext.compileCache};
}

/**
 * @template T
 * @param {T[]} value
 * @returns {value is [T, ...T[]]}
 */
function isNotEmpty(value) {
	return value.length > 0;
}
