import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {dirname, join} from 'node:path';
import {resolve} from 'resolve.exports';

import {BuildFailureError} from '../error.js';
import {getPackageName} from '../utils.js';

/** @return {Promise<import('sass')>} */
let getSass = () => {
	const sass = import('sass')
		.then((mod) => mod.default ?? mod)
		.catch((e) => {
			if (
				!e ||
				/** @type {NodeJS.ErrnoException} */ (e).code !== 'ERR_MODULE_NOT_FOUND'
			) {
				throw e;
			}

			throw new BuildFailureError(
				'Failed to load the sass compiler, did you install sass?',
			);
		});
	getSass = () => sass;
	return sass;
};

/** @type {Map<string, {exports?: unknown}>} */
const packageManifests = new Map();

/** @type {import('sass').LegacySyncImporter} */
const sassResolver = (url, prev) => {
	if (url.startsWith('.')) {
		// definitely relative
		return null;
	}

	// support leading tilde
	if (url.startsWith('~')) {
		url = url.slice(1);
	}

	const packageName = getPackageName(url);
	let manifestFile;
	try {
		manifestFile = createRequire(prev).resolve(`${packageName}/package.json`);
	} catch (e) {
		if (
			/** @type {NodeJS.ErrnoException} */ (e).code ===
			'ERR_PACKAGE_PATH_NOT_EXPORTED'
		) {
			throw new Error(`Package ${packageName} doesn't expose package.json`);
		}

		return null;
	}

	let manifest = packageManifests.get(manifestFile);
	if (manifest == null) {
		manifest = /** @type {{exports?: unknown}} */ (
			JSON.parse(readFileSync(manifestFile, 'utf-8'))
		);
		// only cache the exports key, we don't care about the rest
		packageManifests.set(manifestFile, {exports: manifest.exports});
	}

	const deepImport = url.slice(packageName.length);
	return {
		file: join(
			dirname(manifestFile),
			resolve(manifest, `.${deepImport}`, {
				conditions: ['sass', 'style'],
				unsafe: true,
			})?.[0] ?? deepImport,
		),
	};
};

/**
 * @param {string} file
 * @param {string} data
 * @param {boolean} indentedSyntax
 */
async function compile(file, data, indentedSyntax) {
	const {renderSync} = await getSass();

	try {
		return renderSync({
			data,
			file,
			indentedSyntax,
			importer: sassResolver,
		});
	} catch (e) {
		const message = /** @type {Error} */ (e).message || String(e);
		throw new BuildFailureError(
			`Failed to compile SASS in ${file}: ${message}`,
		);
	}
}

/** @type {import('../resource-processor.js').StyleProcessor[]} */
export const sassProcessors = [
	{
		languageName: 'sass',
		fileExtensions: ['.sass'],
		process: (input) =>
			compile(
				input.context.resourceFile ?? input.context.containingFile,
				input.content,
				true,
			),
	},
	{
		languageName: 'scss',
		fileExtensions: ['.scss'],
		process: (input) =>
			compile(
				input.context.resourceFile ?? input.context.containingFile,
				input.content,
				false,
			),
	},
];
