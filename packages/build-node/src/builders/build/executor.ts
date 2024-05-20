import {
	type BuilderContext,
	BuildFailureError,
	copyAssets,
	resolveProjectPath,
	resolveWorkspacePath,
	runPackager,
} from "@snuggery/architect";
import type {JsonObject} from "@snuggery/core";
import fs from "node:fs/promises";
import {createRequire} from "node:module";
import {join} from "node:path";
import {pathToFileURL} from "node:url";

import {loadConfiguration} from "./config.js";
import {createPlugin, PluginFactory, WrappedPlugin} from "./plugin.js";
import type {Schema} from "./schema.js";
import {tsc} from "./typescript.js";

const manifestFilename = "package.json";

let hasTypescript: boolean | undefined;

export async function executeBuild(
	input: Schema,
	context: BuilderContext,
): Promise<void> {
	const config = await loadConfiguration(context);
	const workspaceRequire = createRequire(
		resolveWorkspacePath(context, "<workspace>"),
	);
	const loadedPlugins = await Promise.all(
		(input.plugins ?? config.plugins ?? []).map(
			async (pluginPossiblyWithConfig) => {
				let plugin: string;
				let config: JsonObject | undefined;
				if (Array.isArray(pluginPossiblyWithConfig)) {
					[plugin, config] = pluginPossiblyWithConfig;
				} else {
					plugin = pluginPossiblyWithConfig;
				}

				let exportName: string | undefined;
				if (plugin.includes("#")) {
					[plugin, exportName] = plugin.split("#", 2) as [string, string];
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
				const loadedPlugin: PluginFactory = exportName
					? loadedPluginModule[exportName]
					: loadedPluginModule.default ?? loadedPluginModule;

				return createPlugin(context, loadedPlugin, input, config);
			},
		),
	);

	if (typeof hasTypescript !== "boolean") {
		const require = createRequire(import.meta.url);
		try {
			require.resolve("typescript/package.json");
			hasTypescript = true;
		} catch {
			hasTypescript = false;
		}
	}

	const tsconfig = input.tsconfig ?? config.tsconfig;
	const keepScripts = input.keepScripts ?? config.keepScripts;
	const keepDevDependencies =
		input.keepDevDependencies ?? config.keepDevDependencies;
	const packager = input.packager ?? config.packager;
	const shouldRunPackager = input.package ?? !!packager;

	const outputFolder = input.outputFolder
		? resolveWorkspacePath(context, input.outputFolder)
		: await resolveProjectPath(context, "dist");

	const manifest = await resolveProjectPath(context, manifestFilename)
		.then((path) => fs.readFile(path, "utf8"))
		.then((manifest) => JSON.parse(manifest) as JsonObject);

	const {compile, assets = []} = input;

	context.logger.info(`Building ${manifest.name}`);

	await fs.mkdir(outputFolder, {recursive: true});

	if (compile || hasTypescript) {
		await tsc(context, {
			compile,
			tsconfig,
			outputFolder,
			transformers: loadedPlugins.map(
				(plugin) => plugin.typescriptTransformers,
			),
		});
	}

	try {
		await writeManifest(
			manifest,
			{keepScripts, keepDevDependencies},
			outputFolder,
			loadedPlugins,
		);
	} catch (e) {
		throw new BuildFailureError(
			`Failed to copy ${manifestFilename}: ${
				e instanceof Error ? e.message : e
			}`,
		);
	}

	context.logger.debug("Copying assets...");
	await copyAssets(context, outputFolder, assets);

	if (shouldRunPackager) {
		context.logger.debug("Running packager");
		await runPackager(context, {packager, directory: outputFolder});
	}

	for (const plugin of loadedPlugins) {
		plugin.finalize();
	}

	context.logger.debug(`Build for ${manifest.name} is complete`);
}

async function writeManifest(
	manifest: JsonObject,
	{
		keepScripts,
		keepDevDependencies,
	}: Pick<Schema, "keepScripts" | "keepDevDependencies">,
	outputFolder: string,
	plugins: readonly WrappedPlugin[],
) {
	if (
		manifest.publishConfig != null &&
		typeof manifest.publishConfig === "object" &&
		!Array.isArray(manifest.publishConfig)
	) {
		if (manifest.publishConfig.main !== undefined) {
			manifest.main = manifest.publishConfig.main;
			delete manifest.publishConfig.main;
		}

		if (manifest.publishConfig.exports !== undefined) {
			manifest.exports = manifest.publishConfig.exports;
			delete manifest.publishConfig.exports;
		}

		if (manifest.publishConfig.imports !== undefined) {
			manifest.imports = manifest.publishConfig.imports;
			delete manifest.publishConfig.imports;
		}
	}

	for (const plugin of plugins) {
		plugin.processManifest(manifest);
	}

	if (!keepScripts) {
		delete manifest.scripts;
	}
	if (!keepDevDependencies) {
		delete manifest.devDependencies;
	}
	delete manifest.private;

	await fs.writeFile(
		join(outputFolder, manifestFilename),
		JSON.stringify(manifest, null, 2),
	);
}
