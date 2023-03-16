import {
	copyAssets,
	resolveProjectPath,
	resolveWorkspacePath,
	runPackager,
} from '@snuggery/architect';
import {BuildFailureError} from '@snuggery/architect/create-builder';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {join} from 'node:path';
import process from 'node:process';
import {pathToFileURL} from 'node:url';

import {
	build,
	BuildFailureError as AngularBuildFailureError,
} from '../../compiler.js';

import {loadConfiguration} from './config.js';

const manifestFilename = 'package.json';

const emoji = ['✨', '🚢', '🎉', '💯', '✅', '🏁', '🌈', '🦄'];

/**
 * @param {import('./schema.js').Schema} input
 * @param {import('@angular-devkit/architect').BuilderContext} context
 * @returns {Promise<void>}
 */
export async function executeBuild(
	{
		assets = [],
		primaryEntryPoint,
		secondaryEntryPoints = [],

		packager,
		tsconfig,
		outputFolder,
		plugins = [],
		inlineStyleLanguage,

		keepDevDependencies,
		keepScripts,

		flags,
	},
	context,
) {
	const configuration = await loadConfiguration(context);
	// The ??= operator is only available in node 16+
	tsconfig = tsconfig ?? configuration.tsconfig;
	if (plugins.length === 0 && configuration.plugins) {
		plugins = configuration.plugins;
	}

	keepScripts = keepScripts ?? configuration.keepScripts;
	keepDevDependencies =
		keepDevDependencies ?? configuration.keepDevDependencies;

	packager = packager ?? configuration.packager;

	inlineStyleLanguage =
		inlineStyleLanguage ?? configuration.inlineStyleLanguage;

	flags = flags
		? {
				enableApiExtractor:
					flags.enableApiExtractor ?? configuration.flags?.enableApiExtractor,
				usePrivateApiAsImportIssueWorkaround:
					flags.usePrivateApiAsImportIssueWorkaround ??
					configuration.flags?.usePrivateApiAsImportIssueWorkaround,
		  }
		: configuration.flags;

	const useCentralOutputFolder =
		flags?.useCentralOutputFolder ??
		configuration.flags?.useCentralOutputFolder ??
		process.versions.pnp == null;

	tsconfig =
		resolveWorkspacePath(context, tsconfig) ??
		(await resolveProjectPath(context, 'tsconfig.json'));

	/**
	 * @param {string | import('./schema.js').EntryPoint} input
	 * @returns {import('../../compiler.js').EntryPoint}
	 */
	function resolveEntryPoint(input) {
		if (typeof input === 'string') {
			return {
				manifestFile: resolveWorkspacePath(context, input),
				tsConfigFile: tsconfig,
			};
		}

		let manifestFile = resolveWorkspacePath(context, input.manifest);
		let mainFile = resolveWorkspacePath(context, input.main);
		let tsConfigFile =
			resolveWorkspacePath(context, input.tsconfig) ?? tsconfig;

		return {manifestFile, mainFile, tsConfigFile};
	}

	const primaryCompilerEntryPoint = resolveEntryPoint(
		primaryEntryPoint ?? (await resolveProjectPath(context, manifestFilename)),
	);

	outputFolder =
		resolveWorkspacePath(context, outputFolder) ??
		(useCentralOutputFolder
			? resolveWorkspacePath(
					context,
					join(
						'dist',
						JSON.parse(
							await readFile(primaryCompilerEntryPoint.manifestFile, 'utf8'),
						).name,
					),
			  )
			: await resolveProjectPath(context, 'dist'));

	const workspaceRequire = createRequire(
		resolveWorkspacePath(context, '<workspace>'),
	);
	const loadedPlugins = await Promise.all(
		plugins.map(async pluginPossiblyWithConfig => {
			/** @type {string} */
			let plugin;
			/** @type {import('@snuggery/core').JsonObject=} */
			let config;
			if (Array.isArray(pluginPossiblyWithConfig)) {
				[plugin, config] = pluginPossiblyWithConfig;
			} else {
				plugin = pluginPossiblyWithConfig;
			}

			/** @type {string=} */
			let exportName;
			if (plugin.includes('#')) {
				[plugin, exportName] = /** @type {[String, string]} */ (
					plugin.split('#', 2)
				);
			}

			let resolvedPlugin;
			try {
				resolvedPlugin = workspaceRequire.resolve(plugin);
			} catch {
				resolvedPlugin = workspaceRequire.resolve(`./${plugin}`);
			}

			const loadedPluginModule = await import(
				pathToFileURL(resolvedPlugin).href
			);
			/** @type {import('../../compiler.js').CompilerPluginFactory} */
			const loadedPlugin = exportName
				? loadedPluginModule[exportName]
				: loadedPluginModule.default ?? loadedPluginModule;

			if (config) {
				return /** @type {const} */ ([loadedPlugin, config]);
			}

			return loadedPlugin;
		}),
	);

	try {
		// The `build` function logs to the console when it starts compilation,
		// but it doesn't log at the end, as we still need to copy assets etc.
		await build({
			rootFolder: context.workspaceRoot,
			logger: context.logger,

			primaryEntryPoint: resolveEntryPoint(
				primaryEntryPoint ??
					(await resolveProjectPath(context, manifestFilename)),
			),
			secondaryEntryPoints:
				// The angular architect fills in empty arrays by default
				secondaryEntryPoints?.length > 0
					? secondaryEntryPoints.map(resolveEntryPoint)
					: undefined,
			keepDevDependencies,
			keepScripts,
			outputFolder,
			plugins: loadedPlugins,
			inlineStyleLanguage,
			flags,
		});
	} catch (e) {
		if (e instanceof AngularBuildFailureError) {
			throw new BuildFailureError(e.message);
		}

		throw e;
	}

	if (assets?.length > 0) {
		context.logger.info('Copying assets...');
		await copyAssets(context, outputFolder, assets);
	}

	if (packager != null) {
		context.logger.debug('Running packager...');
		await runPackager(context, {
			packager,
			directory: outputFolder,
		});
	}

	context.logger.info(
		`Done! ${emoji[Math.floor(Math.random() * emoji.length)]}`,
	);
}
