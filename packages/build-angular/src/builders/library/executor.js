import {
	BuildFailureError,
	copyAssets,
	resolveProjectPath,
	resolveWorkspacePath,
	runPackager,
} from "@snuggery/architect";
import {readFile, stat} from "node:fs/promises";
import {createRequire} from "node:module";
import {join} from "node:path";
import process from "node:process";
import {pathToFileURL} from "node:url";

import {
	build,
	BuildFailureError as AngularBuildFailureError,
} from "../../compiler.js";

import {loadConfiguration} from "./config.js";

const manifestFilename = "package.json";

const emoji = ["✨", "🚢", "🎉", "💯", "✅", "🏁", "🌈", "🦄"];

/**
 * @param {import('./schema.js').Schema} input
 * @param {import('@snuggery/architect').BuilderContext} context
 * @returns {Promise<void>}
 */
export async function executeBuild(
	{
		assets = [],
		manifest,
		main,

		package: shouldRunPackage,
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
	tsconfig ??= configuration.tsconfig;
	if (plugins.length === 0 && configuration.plugins) {
		plugins = configuration.plugins;
	}

	keepScripts ??= configuration.keepScripts;
	keepDevDependencies ??= configuration.keepDevDependencies;

	packager ??= configuration.packager;
	shouldRunPackage ??= !!packager;

	inlineStyleLanguage ??= configuration.inlineStyleLanguage;

	flags =
		flags ?
			{
				enableApiExtractor:
					flags.enableApiExtractor ?? configuration.flags?.enableApiExtractor,
				usePrivateApiAsImportIssueWorkaround:
					flags.usePrivateApiAsImportIssueWorkaround ??
					configuration.flags?.usePrivateApiAsImportIssueWorkaround,
			}
		:	configuration.flags;

	const useCentralOutputFolder =
		flags?.useCentralOutputFolder ??
		configuration.flags?.useCentralOutputFolder ??
		process.versions.pnp == null;

	manifest =
		resolveWorkspacePath(context, manifest) ??
		(await resolveProjectPath(context, manifestFilename));
	main = resolveWorkspacePath(context, main);

	if (tsconfig) {
		tsconfig = resolveWorkspacePath(context, tsconfig);
	} else {
		for (const filename of ["tsconfig.lib.json", "tsconfig.json"]) {
			const resolvedTsconfig = await resolveProjectPath(context, filename);

			try {
				if ((await stat(resolvedTsconfig)).isFile()) {
					tsconfig = resolvedTsconfig;
					break;
				}
			} catch {
				// ignore
			}
		}

		if (!tsconfig) {
			throw new BuildFailureError(
				"No tsconfig could be found, try passing in the path to your tsconfig",
			);
		}
	}

	outputFolder =
		resolveWorkspacePath(context, outputFolder) ??
		(useCentralOutputFolder ?
			resolveWorkspacePath(
				context,
				join("dist", JSON.parse(await readFile(manifest, "utf8")).name),
			)
		:	await resolveProjectPath(context, "dist"));

	const workspaceRequire = createRequire(
		resolveWorkspacePath(context, "<workspace>"),
	);
	const loadedPlugins = await Promise.all(
		plugins.map(async (pluginPossiblyWithConfig) => {
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
			if (plugin.includes("#")) {
				[plugin, exportName] = /** @type {[String, string]} */ (
					plugin.split("#", 2)
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
			const loadedPlugin =
				exportName ?
					loadedPluginModule[exportName]
				:	(loadedPluginModule.default ?? loadedPluginModule);

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

			manifestFile: manifest,
			mainFile: main,
			tsConfigFile: tsconfig,

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
		context.logger.info("Copying assets...");
		await copyAssets(context, outputFolder, assets);
	}

	if (shouldRunPackage) {
		context.logger.debug("Running packager...");
		await runPackager(context, {
			packager,
			directory: outputFolder,
		});
	}

	context.logger.info(
		`Done! ${emoji[Math.floor(Math.random() * emoji.length)]}`,
	);
}
