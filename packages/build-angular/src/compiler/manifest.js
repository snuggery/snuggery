/* cspell:ignore fesm */

import {writeFile} from 'node:fs/promises';
import {dirname, join, posix, relative as _relative} from 'node:path';

import {BuildFailureError} from './error.js';
import {ensureUnixPath} from './utils.js';

/**
 * @param {string} from
 * @param {string} to
 * @returns {string}
 */
function relative(from, to) {
	return `./${ensureUnixPath(_relative(from, to))}`;
}

/**
 * @typedef {object} Manifest
 * @property {string} name
 * @property {'commonjs' | 'module'} [type]
 * @property {string} [main]
 * @property {boolean | string[]} [sideEffects]
 * @property {Record<string, string>} [scripts]
 * @property {Record<string, string>} [devDependencies]
 * @property {Record<string, string>} [dependencies]
 * @property {Record<string, string>} [peerDependencies]
 * @property {Record<string, Record<string, unknown> | string | string[]> | string | string[]} [exports]
 * @property {string} [fesm2022]
 * @property {string} [esm2022]
 * @property {string} [typings]
 * @property {string} [module]
 * @property {string} [es2022]
 * @property {{exports?: Manifest['exports']}} [publishConfig]
 */

/**
 * @param {string} manifestFile
 * @param {Manifest} manifest
 * @returns {string=}
 */
export function findPrimaryEntryFile(manifestFile, manifest) {
	if (manifest.exports != null) {
		const exports = normalizeExports(manifest.exports);

		if (exports['.'] !== undefined) {
			const relativeExport = findSnuggeryExport(exports['.']);

			return relativeExport != null
				? join(dirname(manifestFile), relativeExport)
				: undefined;
		}
	}

	if (manifest.main != null) {
		return join(dirname(manifestFile), manifest.main);
	}

	return join(dirname(manifestFile), 'index.ts');
}

/**
 * @param {string} manifestFile
 * @param {Manifest} manifest
 * @param {string} [mainFile]
 * @returns {Generator<[name: string, path: string]>}
 */
export function* findEntryPoints(manifestFile, manifest, mainFile) {
	if (mainFile) {
		yield ['.', mainFile];
		return;
	}

	if (manifest.exports == null) {
		if (manifest.main == null) {
			throw new BuildFailureError(
				`Failed to find a main file in ${manifestFile}`,
			);
		}

		yield ['.', join(dirname(manifestFile), manifest.main)];
		return;
	}

	const exports = normalizeExports(manifest.exports);

	for (const [name, value] of Object.entries(exports)) {
		const exportPath = findSnuggeryExport(value);
		if (exportPath != null) {
			yield [name, join(dirname(manifestFile), exportPath)];
		}
	}
}

/**
 * @param {NonNullable<Manifest['exports']>} exports
 * @returns {Record<string, unknown>}
 */
function normalizeExports(exports) {
	if (typeof exports !== 'object' || Array.isArray(exports)) {
		return {'.': exports};
	}

	const exportedNames = Object.keys(exports);
	if (exportedNames.some(name => name !== '.' && !name.startsWith('./'))) {
		return {'.': exports};
	}

	return exports;
}

/**
 * @param {unknown} exportValue
 * @returns {string | null}
 */
function findSnuggeryExport(exportValue) {
	if (exportValue == null) {
		return null;
	}

	if (typeof exportValue === 'string') {
		return posix.extname(exportValue) === '.ts' ? exportValue : null;
	}

	if (Array.isArray(exportValue)) {
		for (const subValue of exportValue) {
			const found = findSnuggeryExport(subValue);
			if (found != null) {
				return found;
			}
		}

		return null;
	}

	if (typeof exportValue !== 'object') {
		return null;
	}

	const objExport = /** @type {import('@snuggery/core').JsonObject} */ (
		exportValue
	);
	if ('snuggery' in objExport) {
		return findSnuggeryExport(objExport.snuggery);
	}

	return (
		findSnuggeryExport(objExport.import) ??
		findSnuggeryExport(objExport.default)
	);
}

/**
 * @typedef {object} WriteManifestInput
 * @property {readonly import('./plugin.js').WrappedPlugin[]} plugins
 * @property {string} outputFolder
 * @property {boolean} keepDevDependencies
 * @property {boolean} keepScripts
 */

/**
 *
 * @param {import('./context.js').BuildContext<string>} context
 * @param {WriteManifestInput} input
 * @returns {Promise<void>}
 */
export async function writeManifest(
	context,
	{plugins, outputFolder, keepDevDependencies, keepScripts},
) {
	const manifest =
		/** @type {Manifest & import('@snuggery/core').JsonObject} */ (
			structuredClone(context.manifest)
		);
	delete manifest.private;

	delete manifest.main;
	if (!keepDevDependencies) {
		delete manifest.devDependencies;
	}
	if (!keepScripts) {
		delete manifest.scripts;
	}

	// Default sideEffects to false unless explicitly set to true or an array of files
	if (!Array.isArray(manifest.sideEffects)) {
		manifest.sideEffects = manifest.sideEffects === true;
	}

	let exports = structuredClone(
		manifest.publishConfig?.exports ?? manifest.exports ?? {},
	);

	if (manifest.publishConfig) {
		// Delete the exports key from publishConfig, because we already moved the
		// publishConfig.exports to the real exports key
		delete manifest.publishConfig.exports;
	}

	if (typeof exports === 'string' || Array.isArray(exports)) {
		// -> maps to the default key of ., which gets overwritten anyway so we can drop it
		exports = {};
	}

	for (const entryPoint of context.entryPoints) {
		let keyExports = exports[entryPoint.exportName] ?? {};
		if (typeof keyExports === 'string' || Array.isArray(keyExports)) {
			// -> maps to the default key, which gets overwritten anyway so we can drop it
			keyExports = {};
		}

		delete keyExports.types;
		delete keyExports.esm2022;
		delete keyExports.es2022;

		exports[entryPoint.exportName] = {
			types: relative(outputFolder, entryPoint.declarationFile),
			esm: relative(outputFolder, entryPoint.esmFile),
			esm2022: relative(outputFolder, entryPoint.esmFile),

			...keyExports,

			default: relative(outputFolder, entryPoint.fesmFile),
		};
	}

	if (!Reflect.has(exports, './package.json')) {
		exports['./package.json'] = './package.json';
	}

	manifest.exports = exports;

	for (const plugin of plugins) {
		plugin.processManifest(manifest);
	}

	await writeFile(
		join(outputFolder, 'package.json'),
		JSON.stringify(manifest, null, 2),
	);
}
