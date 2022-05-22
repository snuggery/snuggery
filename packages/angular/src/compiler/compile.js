import {posix} from 'node:path';
import ts from 'typescript';

import {FileCache} from './cache/file.js';
import {compile as performCompilation} from './compile/compile.js';
import {parseConfiguration} from './compile/tsconfig.js';

/**
 * @typedef {import('./compile/compile.js').Cache} CompileCache
 */

/**
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
 * @property {string} outputFile
 * @property {string} declarationOutputFile
 * @property {ts.ScriptTarget} target
 * @property {boolean} usePrivateApiAsImportIssueWorkaround
 */

/**
 *
 * @param {import('./context.js').BuildContext} context
 * @param {import('./context.js').EntryPoint} currentEntryPoint
 * @param {CompileInput} input
 * @returns {Promise<void>}
 */
export async function compile(
	context,
	currentEntryPoint,
	{
		outputFile,
		declarationOutputFile,
		target,
		usePrivateApiAsImportIssueWorkaround,
	},
) {
	context.logger.debug('Starting Angular compiler!');

	const safeCache = excludeSelfFromModuleCache(context.compileCache, context);

	await performCompilation({
		config: parseConfiguration({
			target,
			outputFile,
			declarationOutputFile,
			entryPoints: context.entryPoints,
			rootFolder: context.rootFolder,
			mainFile: currentEntryPoint.mainFile,
			tsConfigFile: currentEntryPoint.tsConfigFile,
			packageName: currentEntryPoint.packageName,
			usePrivateApiAsImportIssueWorkaround,
		}),
		cache: safeCache,
		logger: context.logger,
		plugins: context.plugins,
		resourceProcessor: context.resourceProcessor,
		usePrivateApiAsImportIssueWorkaround,
	});
	context.logger.debug('Compilation succeeded.');

	context.compileCache.program = safeCache.program;
}
