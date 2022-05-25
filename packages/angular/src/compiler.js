/** cspell:ignore fesm */

import {mkdir, readFile, rm} from 'node:fs/promises';
import {basename, dirname, join, posix, relative, resolve} from 'node:path';
import {cwd} from 'node:process';

import {compile, createCompileCache, ScriptTarget} from './compiler/compile.js';
import {BuildContext} from './compiler/context.js';
import {BuildFailureError} from './compiler/error.js';
import * as flags from './compiler/flags.js';
import {flattenCode} from './compiler/flatten/code.js';
import {flattenTypes} from './compiler/flatten/types.js';
import {defaultLogger} from './compiler/logger.js';
import {writeManifest} from './compiler/manifest.js';
import {performance} from './compiler/performance.js';
import {createPlugin} from './compiler/plugin.js';
import {ResourceProcessor} from './compiler/resource-processor.js';
import {ensureUnixPath, getUnscopedName} from './compiler/utils.js';

export {BuildFailureError, createCompileCache};

/**
 * Single entry point of the library to build.
 *
 * A library can have multiple entry points, one is always the "primary" entry point. This is the package itself, e.g. `lorem` or `@ipsum/dolor`.
 * Packages can have secondary entry points, for example `lorem/sit` or `@ipsum/dolor/amet`.
 *
 * @typedef {object} EntryPoint
 *
 * @property {string} manifestFile Path to the `package.json` file of this entry point, can be absolute or relative to the `rootFolder` passed of the input
 *
 * @property {string=} mainFile Main file of the entry point
 *
 * Defaults to the `main` of the `package.json` or `index.ts` if that isn't set
 *
 * @property {string=} tsConfigFile Path to the typescript configuration file for this entry point
 *
 * For secondary entry points this falls back to the `tsConfigFile` configured in the primary entry point
 */

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
 * @property {Readonly<EntryPoint>} primaryEntryPoint Main entry point for the library
 *
 * This is the only required property on the input.
 *
 * @property {readonly Readonly<EntryPoint>[]} [secondaryEntryPoints] Secondary entry points for the library, if any
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

/**
 * @param {Readonly<EntryPoint>} entryPoint
 * @param {string} rootFolder
 * @param {string | undefined} nameOverride
 * @param {string} outputFolder
 * @param {string} mainOutputFolder
 * @param {string=} fallbackTsConfigFile
 * @returns {Promise<import('./compiler/context.js').EntryPoint & {
 *   esm2020File: string;
 *   fesm2020File: string;
 *   fesm2015File: string;
 *   typesFile: string;
 * }>}
 */
async function expandEntryPoint(
	{manifestFile, mainFile, tsConfigFile},
	rootFolder,
	nameOverride,
	outputFolder,
	mainOutputFolder,
	fallbackTsConfigFile,
) {
	const resolvedManifestFile = resolve(rootFolder, manifestFile);
	const manifest = /** @type {import('./compiler/manifest.js').Manifest} */ (
		JSON.parse(await readFile(resolvedManifestFile, 'utf-8'))
	);

	if (!mainFile) {
		mainFile = join(dirname(resolvedManifestFile), manifest.main ?? 'index.ts');
	}

	if (nameOverride && manifest.name && nameOverride !== manifest.name) {
		throw new BuildFailureError(
			`Manifest ${manifestFile} should contain name ${JSON.stringify(
				nameOverride,
			)} but it is named ${JSON.stringify(manifest.name)}`,
		);
	}

	const packageName = nameOverride ?? manifest.name;
	if (!packageName) {
		throw new BuildFailureError(
			`Manifest ${manifestFile} doesn't define a name`,
		);
	}

	const outputBasename = `${getUnscopedName(packageName)}.js`;

	return {
		manifestFile: resolvedManifestFile,
		manifest,
		mainFile,
		packageName,
		tsConfigFile: tsConfigFile ?? fallbackTsConfigFile,
		outputFolder,

		esm2020File: join(outputFolder, 'esm2020', outputBasename),
		fesm2020File: join(mainOutputFolder, 'fesm2020', outputBasename),
		fesm2015File: join(mainOutputFolder, 'fesm2015', outputBasename),
		typesFile: join(
			outputFolder,
			'types',
			`${basename(outputBasename, '.js')}.d.ts`,
		),
	};
}

const globalCache = createCompileCache();

/**
 * Build an angular library
 *
 * @param {CompilerInput} input Configuration for the compiler
 * @returns {Promise<CompilerOutput>} The output
 */
export async function build({
	primaryEntryPoint,
	secondaryEntryPoints = [],
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

	performance.mark('start');
	const primaryCompilationEntryPoint = await expandEntryPoint(
		primaryEntryPoint,
		rootFolder,
		undefined,
		outputFolder,
		outputFolder,
	);

	const secondaryCompilationEntryPoints = await Promise.all(
		secondaryEntryPoints.map(entryPoint => {
			const subName = relative(
				dirname(primaryCompilationEntryPoint.manifestFile),
				dirname(resolve(rootFolder, entryPoint.manifestFile)),
			);
			const name = posix.join(
				primaryCompilationEntryPoint.packageName,
				ensureUnixPath(subName),
			);

			return expandEntryPoint(
				entryPoint,
				rootFolder,
				name,
				join(outputFolder, subName),
				outputFolder,
				primaryCompilationEntryPoint.tsConfigFile,
			);
		}),
	);

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
				primaryEntryPoint,
				secondaryEntryPoints,
				rootFolder,
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
		entryPoints: [
			primaryCompilationEntryPoint,
			...secondaryCompilationEntryPoints,
		],
		primaryEntryPoint: primaryCompilationEntryPoint,
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

	// Start by compiling all entryPoints
	for (const entryPoint of buildContext.entryPoints) {
		logger.info(`Building ${entryPoint.packageName}...`);
		await compile(buildContext, entryPoint, {
			declarationOutputFile: entryPoint.typesFile,
			outputFile: entryPoint.esm2020File,
			target: ScriptTarget.ES2020,
			usePrivateApiAsImportIssueWorkaround,
		});
	}

	performance.mark('compiled');
	performance.measure('compile', 'cleaned', 'compiled');

	// Then flatten the code
	const flattenEntryPoints =
		// It would be nice if typescript knew calling map() on [T, ...T[]] returns [U, ...U[]] and not U[]
		/** @type {[import('./compiler/flatten/code.js').EntryPoint, ...import('./compiler/flatten/code.js').EntryPoint[]]}*/ (
			buildContext.entryPoints.map(entryPoint => ({
				packageName: entryPoint.packageName,
				mainFile: entryPoint.esm2020File,
			}))
		);
	await Promise.all([
		flattenCode({
			entryPoints: flattenEntryPoints,
			target: 'es2020',
			outputFolder: join(outputFolder, 'fesm2020'),
		}),
		flattenCode({
			entryPoints: flattenEntryPoints,
			target: 'es2015',
			outputFolder: join(outputFolder, 'fesm2015'),
		}),
	]);

	performance.mark('code-flattened');
	performance.measure('flatten code', 'compiled', 'code-flattened');

	// And the types
	for (const entryPoint of buildContext.entryPoints) {
		const flattenedTypesFile = join(entryPoint.outputFolder, 'index.d.ts');

		await flattenTypes(buildContext, {
			definitionFolder: dirname(entryPoint.typesFile),
			mainDefinitionFile: entryPoint.typesFile,
			outputFile: flattenedTypesFile,
			enableApiExtractor,
		});

		entryPoint.typesFile = flattenedTypesFile;
	}

	performance.mark('types-flattened');
	performance.measure('flatten types', 'code-flattened', 'types-flattened');

	// Finally, write the manifest
	await writeManifest({
		plugins,
		outputFolder,
		entryPoint: primaryCompilationEntryPoint,
		keepDevDependencies,
		keepScripts,
		originalMainManifest: primaryCompilationEntryPoint.manifest,
		originalManifest: primaryCompilationEntryPoint.manifest,
		exportedEntryPoints: secondaryCompilationEntryPoints,
	});

	for (const plugin of plugins) {
		plugin.finalize();
	}

	return {cache: buildContext.compileCache};
}
