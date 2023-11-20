import {posix} from 'node:path';
import ts from 'typescript';

import {FileCache} from './cache/file.js';
import {compile as performCompilation} from './compile/compile.js';
import {parseConfiguration} from './compile/tsconfig.js';
import {BuildFailureError} from './error.js';

/**
 * @typedef {import('./compile/compile.js').Cache} CompileCache
 */

/**
 * Create a compilation cache
 *
 * Cache values can be passed as `cache` property when running the library compiler.
 *
 * @returns {CompileCache}
 */
export function createCompileCache() {
	return {
		moduleResolution: ts.createModuleResolutionCache(process.cwd(), s => s),
		files: new FileCache(),
		program: undefined,
	};
}

/**
 * @param {CompileCache} cache
 * @param {import('./context.js').BuildContext} context
 * @returns {CompileCache}
 */
function excludeSelfFromModuleCache(cache, context) {
	const selfCache = ts.createModuleResolutionCache(process.cwd(), s => s);
	const ownPackageNames = new Set(
		context.entryPoints.map(entryPoint => entryPoint.packageName),
	);

	/** @param {string} p */
	function isInsidePackage(p) {
		return !posix.relative(context.rootFolder, p).startsWith('../');
	}

	return {
		...cache,
		moduleResolution: {
			...cache.moduleResolution,

			getOrCreateCacheForDirectory(directoryName, redirectedReference) {
				if (isInsidePackage(directoryName)) {
					return selfCache.getOrCreateCacheForDirectory(
						directoryName,
						redirectedReference,
					);
				}

				return cache.moduleResolution.getOrCreateCacheForDirectory(
					directoryName,
					redirectedReference,
				);
			},

			getOrCreateCacheForModuleName(
				nonRelativeModuleName,
				redirectedReference,
			) {
				if (
					ownPackageNames.has(nonRelativeModuleName) ||
					isInsidePackage(nonRelativeModuleName)
				) {
					return selfCache.getOrCreateCacheForModuleName(
						nonRelativeModuleName,
						redirectedReference,
					);
				}

				return cache.moduleResolution.getOrCreateCacheForModuleName(
					nonRelativeModuleName,
					redirectedReference,
				);
			},
		},
	};
}

export const ScriptTarget = ts.ScriptTarget;

/**
 * @typedef {object} CompileInput
 * @property {string} tsConfigFile
 * @property {string} outputFolder
 * @property {string} declarationOutputFolder
 * @property {ts.ScriptTarget} target
 * @property {boolean} usePrivateApiAsImportIssueWorkaround
 */

/**
 *
 * @param {import('./context.js').BuildContext} context
 * @param {CompileInput} input
 * @returns {Promise<Awaited<ReturnType<typeof performCompilation>>>}
 */
export async function compile(
	context,
	{
		tsConfigFile,
		outputFolder,
		declarationOutputFolder,
		target,
		usePrivateApiAsImportIssueWorkaround,
	},
) {
	context.logger.debug('Starting Angular compiler!');

	const safeCache = excludeSelfFromModuleCache(context.compileCache, context);

	const result = await performCompilation(context, {
		cache: safeCache,
		config: parseConfiguration(context, {
			tsConfigFile,
			declarationOutputFolder,
			outputFolder,
			target,
			usePrivateApiAsImportIssueWorkaround,
		}),
		usePrivateApiAsImportIssueWorkaround,
	});
	context.logger.debug('Compilation succeeded.');

	context.compileCache.program = safeCache.program;

	return result;
}

/**
 *
 * @param {import('./context.js').BuildContext<unknown>} context
 * @param {Awaited<ReturnType<typeof performCompilation>>} compilationResult
 * @returns {asserts context is import('./context.js').BuildContext<string>}
 */
export function fillInCompilerOutput(
	context,
	{writtenDeclarationFiles, writtenFiles},
) {
	for (const entryPoint of context.entryPoints) {
		const esmFile = writtenFiles.get(entryPoint.mainFile);
		const declarationFile = writtenDeclarationFiles.get(entryPoint.mainFile);

		if (esmFile == null || declarationFile == null) {
			throw new BuildFailureError(
				`Can't find compilation output of entry point ${entryPoint.packageName}`,
			);
		}

		entryPoint.esmFile = esmFile;
		entryPoint.declarationFile = declarationFile;
	}
}
