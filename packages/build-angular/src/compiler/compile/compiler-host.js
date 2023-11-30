import {createCompilerHost as _createCompilerHost} from "@angular/compiler-cli";
import {readFile} from "node:fs/promises";
import {dirname, posix, resolve} from "node:path";
import ts from "typescript";

import {ModuleCache} from "../cache/module.js";
import {performance} from "../performance.js";
import {ensureUnixPath} from "../utils.js";

import {isUsingNodeResolution} from "./tsconfig.js";
import {disallowCjsWriteFileFactory} from "./writer.js";

/**
 * @typedef {object} CreateCompilerHostInput
 * @property {import('@angular/compiler-cli').CompilerOptions} compilerOptions
 * @property {import('typescript').ModuleResolutionCache} moduleResolutionCache
 * @property {import('../cache/file.js').FileCache} fileCache
 * @property {(writtenFilename: string, sourceFile: ts.SourceFile) => void} markWrittenFile
 */

/**
 *
 * @param {import('@angular/compiler-cli').CompilerOptions} compilerOptions
 * @param {string} path
 */
function relativeToRootDir(compilerOptions, path) {
	if (compilerOptions.rootDir) {
		const relative = posix.relative(compilerOptions.rootDir, path);
		if (!relative.startsWith("../")) {
			return relative;
		}
	}

	if (compilerOptions.rootDirs) {
		for (const rootDir of compilerOptions.rootDirs) {
			const relative = posix.relative(rootDir, path);
			if (!relative.startsWith("../")) {
				return relative;
			}
		}
	}

	return path;
}

/**
 *
 * @param {import('../context.js').BuildContext} context
 * @param {CreateCompilerHostInput} options
 * @returns {import('../type-utils.js').RequiredProperties<import('@angular/compiler-cli').CompilerHost, 'fileNameToModuleName'>}
 */
export function createCompilerHost(
	context,
	{compilerOptions, moduleResolutionCache, fileCache, markWrittenFile},
) {
	const moduleCache = new ModuleCache();
	const compilerHost = _createCompilerHost({
		options: compilerOptions,
	});

	const writeFile = isUsingNodeResolution(compilerOptions)
		? disallowCjsWriteFileFactory(context, compilerHost)
		: compilerHost.writeFile.bind(compilerHost);

	return {
		...compilerHost,

		// Add caching to typescript's CompilerHost

		fileExists(fileName) {
			performance.mark("cache: fileExists");
			const cache = fileCache.get(fileName);

			if (cache.exists == null) {
				performance.mark("cache miss: fileExists");
				cache.exists = compilerHost.fileExists.call(this, fileName);
			}

			return cache.exists;
		},

		getSourceFile(fileName, languageVersion) {
			performance.mark("cache: getSourceFile");
			const cache = fileCache.get(fileName);

			if (cache.sourceFile == null) {
				performance.mark("cache miss: getSourceFile");
				cache.sourceFile = compilerHost.getSourceFile.call(
					this,
					fileName,
					languageVersion,
				);
			}

			return cache.sourceFile;
		},

		readFile(fileName) {
			performance.mark("cache: readFile");
			const cache = fileCache.get(fileName);

			if (cache.content == null) {
				performance.mark("cache miss: readFile");
				cache.content = compilerHost.readFile.call(this, fileName);
			}

			return cache.content;
		},

		getModuleResolutionCache() {
			return moduleResolutionCache;
		},

		resolveModuleNames(
			moduleNames,
			containingFile,
			_reusedNames,
			redirectedReference,
			options,
		) {
			containingFile = ensureUnixPath(containingFile);

			return moduleNames.map((moduleName) => {
				const {resolvedModule} = ts.resolveModuleName(
					moduleName,
					containingFile,
					options,
					compilerHost,
					moduleResolutionCache,
					redirectedReference,
				);

				if (!resolvedModule) {
					return undefined;
				}

				moduleCache.set(
					resolvedModule.resolvedFileName,
					containingFile,
					moduleName,
				);
				return resolvedModule;
			});
		},

		// Add caching to Angular's addition to CompilerHost

		// Appears to be unused, angular seems to be using
		// `resolveModuleNames` instead
		moduleNameToFileName(moduleName, containingFile) {
			const {resolvedModule} = ts.resolveModuleName(
				moduleName,
				ensureUnixPath(containingFile),
				compilerOptions,
				compilerHost,
				moduleResolutionCache,
			);

			return resolvedModule?.resolvedFileName ?? null;
		},

		resourceNameToFileName(resourceName, containingFilePath) {
			return resolve(dirname(containingFilePath), resourceName);
		},

		async readResource(fileName) {
			performance.mark("cache: readFile");
			const cache = fileCache.get(fileName);

			if (cache.content == null) {
				performance.mark("cache miss: readFile");
				cache.content = await readFile(fileName, "utf8");
			}

			return cache.content;
		},

		// Process resources (e.g. support SASS, optimize CSS)

		async transformResource(data, resourceContext) {
			performance.mark("cache: transformResource");
			const cache = fileCache.get(
				resourceContext.resourceFile || resourceContext.containingFile,
			);

			if (cache.processedResource == null) {
				cache.processedResource = new Map();
			}

			const cacheKey = resourceContext.resourceFile ? "." : data;
			let result = cache.processedResource.get(cacheKey);

			if (result == null) {
				performance.mark("cache miss: transformResource");
				result = await context.resourceProcessor.getProcessedResource(
					data,
					resourceContext,
				);
				// cache.processedResource.set(cacheKey, result);
			}

			return {content: result};
		},

		// Implement Angular's UnifiedModulesHost

		fileNameToModuleName(importedFilePath, containingFilePath) {
			importedFilePath = posix.normalize(importedFilePath);
			const cache = moduleCache.get(importedFilePath);
			if (cache) {
				return cache;
			}

			// The cache didn't yield a bare specifier as module name,
			// so this file was never imported via a bare specifier.
			// => it was always imported as relative file, which implies
			//    it is part of the entry point itself
			//    -> deduce relative import path

			const relativeImportedFile = relativeToRootDir(
				compilerOptions,
				importedFilePath,
			).replace(/\.([cm]?)tsx?$/, ".$1js");

			const containingFileFolder = posix.dirname(
				relativeToRootDir(compilerOptions, containingFilePath) ??
					containingFilePath,
			);
			const relativeImportPath = posix.relative(
				containingFileFolder,
				relativeImportedFile,
			);

			return relativeImportPath.startsWith("../")
				? relativeImportPath
				: `./${relativeImportPath}`;
		},

		// Disallow CJS in case the node-compliant typescript module resolution is used
		// We should actually always disallow CJS, but in typescript's other module resolution
		// settings that's ± impossible to validate

		writeFile: (
			fileName,
			text,
			writeByteOrderMark,
			onError,
			sourceFiles,
			data,
		) => {
			if (sourceFiles?.length === 1) {
				markWrittenFile(
					fileName,
					/** @type {ts.SourceFile} */ (sourceFiles[0]),
				);
			}

			return writeFile(
				fileName,
				text,
				writeByteOrderMark,
				onError,
				sourceFiles,
				data,
			);
		},
	};
}
