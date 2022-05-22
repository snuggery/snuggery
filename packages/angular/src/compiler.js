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
 * @typedef {object} EntryPoint
 * @property {string} manifestFile
 * @property {string=} mainFile
 * @property {string=} tsConfigFile
 */

/**
 * @typedef {import('./compiler/plugin.js').Plugin} CompilerPlugin
 */

/**
 * @template [I=unknown]
 * @typedef {object} CompilerPluginFactory
 * @property {string} name
 * @property {(compilerInput: Readonly<Required<Omit<CompilerInput, 'plugins'>>>, pluginInput?: I) => CompilerPlugin} create
 */

/**
 * @typedef {Partial<typeof flags>} CompilerFlags
 */

/**
 * @typedef {object} CompilerInput
 * @property {string} [rootFolder]
 * @property {Readonly<EntryPoint>} primaryEntryPoint
 * @property {readonly Readonly<EntryPoint>[]} [secondaryEntryPoints]
 * @property {string} [outputFolder]
 * @property {boolean} [cleanOutputFolder]
 * @property {import('./compiler/compile.js').CompileCache | boolean} [cache]
 * @property {import('./compiler/logger.js').Logger} [logger]
 * @property {readonly (CompilerPluginFactory<void> | readonly [CompilerPluginFactory<unknown>, unknown])[]} [plugins]
 * @property {boolean} [keepScripts]
 * @property {boolean} [keepDevDependencies]
 * @property {string} [inlineStyleLanguage]
 * @property {CompilerFlags} [flags]
 */

/**
 * @typedef {object} CompilerOutput
 * @property {import('./compiler/compile.js').CompileCache} cache
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
 * @param {CompilerInput} input
 * @returns {Promise<CompilerOutput>}
 */
export async function build({
	primaryEntryPoint,
	secondaryEntryPoints = [],
	rootFolder = cwd(),
	outputFolder = join(rootFolder, 'dist'),
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
