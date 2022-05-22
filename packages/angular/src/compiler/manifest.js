/* cspell:ignore fesm */
/* global structuredClone */

import {writeFile} from 'node:fs/promises';
import {join, posix, relative as _relative} from 'node:path';

import {BuildFailureError} from './error.js';
import {ensureUnixPath} from './utils.js';

/**
 * @type {<T>(value: T) => T}
 */
const clone =
	// @ts-expect-error typescript doesn't have types for structuredClone yet
	typeof structuredClone === 'function'
		? // @ts-expect-error typescript doesn't have types for structuredClone yet
		  structuredClone
		: value => JSON.parse(JSON.stringify(value));

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
 * @property {string} [main]
 * @property {(boolean | string[])=} [sideEffects]
 * @property {Record<string, string>=} scripts
 * @property {Record<string, string>=} devDependencies
 * @property {Record<string, string>=} dependencies
 * @property {Record<string, string>=} peerDependencies
 * @property {(Record<string, Record<string, unknown> | string | string[]> | string | string[])=} exports
 * @property {string=} fesm2020
 * @property {string=} fesm2015
 * @property {string=} esm2020
 * @property {string=} typings
 * @property {string=} module
 * @property {string=} es2020
 * @property {{exports?: Manifest['exports']}=} publishConfig
 */

/**
 * @typedef {object} EntryPoint
 * @property {string} packageName
 * @property {string} fesm2020File
 * @property {string} fesm2015File
 * @property {string} esm2020File
 * @property {string} typesFile
 */

/**
 * @typedef {object} WriteManifestInput
 * @property {readonly import('./plugin.js').WrappedPlugin[]} plugins
 * @property {string} outputFolder
 * @property {Manifest} originalManifest
 * @property {Manifest} originalMainManifest
 * @property {EntryPoint} entryPoint
 * @property {readonly EntryPoint[]=} exportedEntryPoints
 * @property {boolean} keepDevDependencies
 * @property {boolean} keepScripts
 */

/**
 *
 * @param {WriteManifestInput} input
 * @returns {Promise<void>}
 */
export async function writeManifest({
	plugins,
	outputFolder,
	originalMainManifest,
	originalManifest,
	entryPoint,
	exportedEntryPoints,
	keepDevDependencies,
	keepScripts,
}) {
	const manifest =
		/** @type {import('@snuggery/core').JsonObject & Manifest} */ ({
			...originalManifest,
		});

	delete manifest.main;
	if (!keepDevDependencies) {
		delete manifest.devDependencies;
	}
	if (!keepScripts) {
		delete manifest.scripts;
	}

	// Default sideEffects to false unless explicitly set to true or an array of files
	if (!Array.isArray(manifest.sideEffects)) {
		manifest.sideEffects =
			(manifest.sideEffects ?? originalMainManifest.sideEffects) !== true;
	}

	// Set the legacy properties that angular expects
	manifest.esm2020 = relative(outputFolder, entryPoint.esm2020File);
	manifest.typings = relative(outputFolder, entryPoint.typesFile);
	manifest.fesm2020 = manifest.es2020 = relative(
		outputFolder,
		entryPoint.fesm2020File,
	);
	manifest.module = manifest.fesm2015 = relative(
		outputFolder,
		entryPoint.fesm2015File,
	);

	if (exportedEntryPoints == null) {
		if (manifest.exports != null) {
			throw new BuildFailureError(
				`Manifest for ${entryPoint.packageName} has an "exports" property, which was not expected`,
			);
		}
	} else {
		let exports = clone(
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

		const exportedEntryPointsMap = new Map([
			['.', entryPoint],
			...exportedEntryPoints.map(
				ep =>
					/** @type {[string, EntryPoint]} */ ([
						`./${posix.relative(entryPoint.packageName, ep.packageName)}`,
						ep,
					]),
			),
		]);

		for (const [key, ep] of exportedEntryPointsMap) {
			let keyExports = exports[key] ?? {};
			if (typeof keyExports === 'string' || Array.isArray(keyExports)) {
				// -> maps to the default key, which gets overwritten anyway so we can drop it
				keyExports = {};
			}

			delete keyExports.types;
			delete keyExports.esm2020;
			delete keyExports.es2020;
			delete keyExports.es2015;
			delete keyExports.node;

			exports[key] = {
				types: relative(outputFolder, ep.typesFile),
				esm2020: relative(outputFolder, ep.esm2020File),
				es2020: relative(outputFolder, ep.fesm2020File),
				es2015: relative(outputFolder, ep.fesm2015File),
				node: relative(outputFolder, ep.fesm2015File),

				...keyExports,

				default: relative(outputFolder, ep.fesm2020File),
			};
		}

		if (!Reflect.has(exports, './package.json')) {
			exports['./package.json'] = './package.json';
		}

		manifest.exports = exports;
	}

	for (const plugin of plugins) {
		plugin.processManifest(manifest);
	}

	await writeFile(
		join(outputFolder, 'package.json'),
		JSON.stringify(manifest, null, 2),
	);
}
