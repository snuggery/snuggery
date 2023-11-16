/* cspell:ignore outdir */

import {build} from 'esbuild';
import {writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {basename, extname, join} from 'node:path';

import {BuildFailureError} from '../error.js';

/**
 * @typedef {object} EntryPoint
 * @property {string} packageName
 * @property {string} mainFile
 */

/**
 * @typedef {object} FlattenCodeInput
 * @property {readonly [EntryPoint, ...EntryPoint[]]} entryPoints
 * @property {string} outputFolder
 * @property {string} target
 */

/**
 * @param {readonly EntryPoint[]} entryPoints
 * @returns {import('esbuild').Plugin}
 */
function resolveOnlySelf(entryPoints) {
	const ownImports = new Map(
		entryPoints.map(entryPoint => [
			entryPoint.packageName,
			entryPoint.mainFile,
		]),
	);

	return {
		name: 'mark-externals',
		setup(build) {
			build.onResolve(
				{
					// Filter so only bare specifiers get passed in, to prevent esbuild
					// from having to shell out from its native code to this plugin for
					// relative or absolute imports.
					//
					// In other words, we want to pass the negative version of
					//   /^(?:\.\.?[\\/]|[\\/]|[a-zA-Z]:\\)/
					// but go doesn't support negative lookahead so we turn it into
					// this beauty:
					//
					// ^(?:          |         |              |            |             ) // starts with one of the following:
					//     \.\.[^/\\]                                                      // .. and then _not_ a slash
					//                \.[^./\\]                                            // . and then not a . or a slash
					//                          [A-Za-z]:[^\\]                             // A drive letter, a colon but then not a backslash
					//                                         [A-Za-z][^:]                // A drive letter but then not a colon
					//                                                      [^./\\A-Za-z]  // not a dot, slash or drive letter
					filter:
						/^(?:\.\.[^/\\]|\.[^./\\]|[A-Za-z]:[^\\]|[A-Za-z][^:]|[^./\\A-Za-z])/,
				},
				({path: specifier}) => {
					const path = ownImports.get(specifier);

					return path ? {path} : {external: true};
				},
			);
		},
	};
}

/**
 * Path to an empty tsconfig file we pass into esbuild
 *
 * Why? Because esbuild looks for a tsconfig if it isn't passed any,
 * even if you explicitly pass it an empty value.
 *
 * ESBuild isn't JavaScript, it's native code. That implies ESBuild
 * doesn't understand Yarn's PnP.
 * That's annoying if the tsconfig ESBuild finds extends a tsconfig
 * from a dependency (e.g. this package's base tsconfig).
 *
 * This also explains why we can't pass in an empty tsconfig file
 * from within this package: ESBuild wouldn't know how to open it in
 * a Yarn PnP environment.
 */
/** @type {Promise<string>=} */
let fakeTsConfig;

/**
 * @param {FlattenCodeInput} input
 * @returns {Promise<void>}
 */
export async function flattenCode(input) {
	try {
		if (fakeTsConfig == null) {
			const tmpPath = join(tmpdir(), 'tsconfig.empty.json');
			fakeTsConfig = writeFile(tmpPath, '{}').then(() => tmpPath);
		}

		await build({
			entryPoints: Object.fromEntries(
				input.entryPoints.map(entryPoint => [
					basename(entryPoint.mainFile, extname(entryPoint.mainFile)),
					entryPoint.mainFile,
				]),
			),

			bundle: true,
			write: true,
			target: [input.target],
			format: 'esm',
			plugins: [resolveOnlySelf(input.entryPoints)],
			sourcemap: 'linked',
			outdir: input.outputFolder,

			tsconfig: await fakeTsConfig,
		});
	} catch {
		// error details are already logged by esbuild
		throw new BuildFailureError('Flattening code failed');
	}
}
