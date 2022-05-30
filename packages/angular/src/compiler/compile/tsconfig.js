/* cspell:ignore ngfactory bazel */

import {readConfiguration} from '@angular/compiler-cli';
import {basename, dirname} from 'node:path';
import {fileURLToPath, URL} from 'node:url';
import ts from 'typescript';

import {BuildFailureError} from '../error.js';

const defaultTsConfigFile = fileURLToPath(
	new URL('./tsconfig.default.json', import.meta.url),
);

/**
 * @typedef {object} ConfigurationInput
 * @property {string | undefined} tsConfigFile
 * @property {string}	rootFolder
 * @property {readonly EntryPoint[]} entryPoints
 * @property {string}	packageName
 * @property {string}	mainFile
 * @property {string}	outputFile
 * @property {string}	declarationOutputFile
 * @property {ts.ScriptTarget} target
 * @property {boolean} usePrivateApiAsImportIssueWorkaround
 * @property {import('../manifest.js').Manifest} primaryManifest
 * @property {import('../manifest.js').Manifest} closestManifest
 */

/**
 * @typedef {object} EntryPoint
 * @property {string} packageName
 * @property {string} outputFolder
 */

/**
 * Whether the given `compilerOptions` enable modern node-compliant resolution
 *
 * @param {ts.CompilerOptions} compilerOptions
 * @returns {boolean}
 */
export function isUsingNodeResolution(compilerOptions) {
	return (
		ts.versionMajorMinor >= '4.7' &&
		compilerOptions.module != null &&
		compilerOptions.module >= ts.ModuleKind.Node16 &&
		compilerOptions.module <= ts.ModuleKind.NodeNext
	);
}

/**
 *
 * @param {ConfigurationInput} input
 * @returns {import('@angular/compiler-cli').ParsedConfiguration}
 */
export function parseConfiguration(input) {
	const defaultConfiguration = readConfiguration(defaultTsConfigFile);
	const configuration = input.tsConfigFile
		? readConfiguration(input.tsConfigFile)
		: defaultConfiguration;

	const compilerOptions = configuration.options;

	compilerOptions.module = compilerOptions.module ?? ts.ModuleKind.ES2022;

	if (
		compilerOptions.module >= ts.ModuleKind.ES2015 &&
		compilerOptions.module <= ts.ModuleKind.ESNext
	) {
		compilerOptions.moduleResolution =
			compilerOptions.moduleResolution ?? ts.ModuleResolutionKind.NodeJs;
	} else if (isUsingNodeResolution(compilerOptions)) {
		const primaryType = input.primaryManifest.type ?? 'commonjs';
		const closestType = input.closestManifest.type ?? 'commonjs';

		if (primaryType !== 'module') {
			throw new BuildFailureError(
				`Compiling angular libraries with TypeScript compiler option "module": "${
					ts.ModuleKind[compilerOptions.module]
				}" currently requires "type": "module" in the package.json for ${
					input.primaryManifest.name
				}`,
			);
		}

		if (closestType !== primaryType) {
			throw new BuildFailureError(
				`Library entrypoint has type set to ${JSON.stringify(
					input.closestManifest.type,
				)}, which doesn't match the primary entrypoint's ${JSON.stringify(
					input.primaryManifest.type,
				)}`,
			);
		}
	} else {
		throw new BuildFailureError(
			`Expected tsconfig to have module set to "es2020" or "node16", but got ${JSON.stringify(
				ts.ModuleKind[compilerOptions.module],
			)}`,
		);
	}

	configuration.emitFlags = defaultConfiguration.emitFlags;

	if (input.usePrivateApiAsImportIssueWorkaround) {
		compilerOptions.rootDir = dirname(input.mainFile);
	}
	compilerOptions.outDir = dirname(input.outputFile);
	compilerOptions.sourceRoot = `file:///vendor/${input.packageName}`;

	compilerOptions.flatModuleId = input.packageName;
	compilerOptions.flatModuleOutFile = basename(input.outputFile);

	compilerOptions.enableIvy = true;
	compilerOptions.compilationMode = 'partial';

	compilerOptions.basePath = input.rootFolder;

	compilerOptions.paths = {
		...compilerOptions.paths,
		...Object.fromEntries(
			input.entryPoints.map(({packageName, outputFolder: targetFolder}) => [
				packageName,
				[targetFolder],
			]),
		),
	};

	// Not emitting on errors means we don't emit when angular code contains errors caused by
	// stricter settings. Especially the `noUnusedLocals` setting causes issues in generated
	// ngfactory files.
	// Angular ensures the compiler doesn't emit these errors as diagnostics, but it doesn't
	// stop the compiler from not emitting any files because of the error.
	//
	// We ensure the build fails if errors are reported by tsc, setting this to false is safe.
	compilerOptions.noEmitOnError = false;

	compilerOptions.target = input.target;
	compilerOptions.declaration = true;
	compilerOptions.declarationDir = dirname(input.declarationOutputFile);
	compilerOptions.emitDeclarationOnly = false;

	compilerOptions.inlineSourceMap = false;
	compilerOptions.sourceMap = true;
	compilerOptions.declarationMap = true;
	compilerOptions.inlineSources = true;

	configuration.rootNames = [input.mainFile];
	if (input.usePrivateApiAsImportIssueWorkaround) {
		// Uh oh, a private property: "This option is internal and is used by the ng_module.bzl rule to switch behavior between Bazel and Blaze."
		compilerOptions._useHostForImportGeneration = true;
	}
	compilerOptions.preserveSymlinks = true;

	compilerOptions.importHelpers = true;

	return configuration;
}
