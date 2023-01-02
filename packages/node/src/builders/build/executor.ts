import type {BuilderContext, BuilderOutput} from '@angular-devkit/architect';
import {
	copyAssets,
	resolveProjectPath,
	resolveWorkspacePath,
	runPackager,
} from '@snuggery/architect';
import {isJsonObject, type JsonObject} from '@snuggery/core';
import {promises as fs} from 'fs';
import {createRequire} from 'module';
import {join} from 'path';
import {pathToFileURL} from 'url';

import {loadConfiguration} from './config';
import {createPlugin, PluginFactory, WrappedPlugin} from './plugin';
import type {Schema} from './schema';
import {tsc} from './typescript';

const manifestFilename = 'package.json';

export async function* executeBuild(
	input: Schema,
	context: BuilderContext,
): AsyncGenerator<BuilderOutput> {
	const config = await loadConfiguration(context);
	const workspaceRequire = createRequire(
		resolveWorkspacePath(context, '<workspace>'),
	);
	const loadedPlugins = await Promise.all(
		(input.plugins ?? config.plugins ?? []).map(
			async pluginPossiblyWithConfig => {
				let plugin: string;
				let config: JsonObject | undefined;
				if (Array.isArray(pluginPossiblyWithConfig)) {
					[plugin, config] = pluginPossiblyWithConfig;
				} else {
					plugin = pluginPossiblyWithConfig;
				}

				let exportName: string | undefined;
				if (plugin.includes('#')) {
					[plugin, exportName] = plugin.split('#', 2) as [string, string];
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

	let hasTypescript: boolean;
	try {
		require.resolve('typescript/package.json');
		hasTypescript = true;
	} catch {
		hasTypescript = false;
	}

	const tsconfig = input.tsconfig ?? config.tsconfig;
	const keepScripts = input.keepScripts ?? config.keepScripts;
	const keepDevDependencies =
		input.keepDevDependencies ?? config.keepDevDependencies;
	const packager = input.packager ?? config.packager;

	const outputFolder = input.outputFolder
		? resolveWorkspacePath(context, input.outputFolder)
		: await resolveProjectPath(context, 'dist');

	const manifest = await resolveProjectPath(context, manifestFilename)
		.then(path => fs.readFile(path, 'utf8'))
		.then(manifest => JSON.parse(manifest) as JsonObject);

	const {compile = false, assets = []} = input;

	context.logger.info(`Building ${manifest.name}`);

	await fs.mkdir(outputFolder, {recursive: true});

	if (compile || hasTypescript) {
		const tscResult = await tsc(
			context,
			{compile, tsconfig},
			outputFolder,
			loadedPlugins,
		);
		if (!tscResult.success) {
			yield tscResult;
			return;
		}
	}

	try {
		await writeManifest(
			manifest,
			{keepScripts, keepDevDependencies},
			outputFolder,
			loadedPlugins,
		);
	} catch (e) {
		yield {
			success: false,
			error: `Failed to copy ${manifestFilename}: ${
				e instanceof Error ? e.message : e
			}`,
		};
		return;
	}

	context.logger.debug('Copying assets...');
	const assetResult = await copyAssets(context, outputFolder, assets);
	if (!assetResult.success) {
		yield assetResult;
		return;
	}

	if (packager) {
		context.logger.debug('Running packager');
		yield runPackager(context, {packager, directory: outputFolder});
	} else {
		yield {success: true};
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
	}: Pick<Schema, 'keepScripts' | 'keepDevDependencies'>,
	outputFolder: string,
	plugins: readonly WrappedPlugin[],
) {
	if (isJsonObject(manifest.publishConfig)) {
		if (manifest.publishConfig.main !== undefined) {
			manifest.main = manifest.publishConfig.main;
			delete manifest.publishConfig.main;
		}

		if (manifest.publishConfig.exports !== undefined) {
			manifest.exports = manifest.publishConfig.exports;
			delete manifest.publishConfig.exports;
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
