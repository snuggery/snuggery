/* cspell:ignore ngfactory bazel */

import {readConfiguration} from '@angular/compiler-cli';
import {fileURLToPath, URL} from 'node:url';
import ts from 'typescript';

import {BuildFailureError} from '../error.js';

const defaultTsConfigFile = fileURLToPath(
	new URL('./tsconfig.default.json', import.meta.url),
);

/**
 * @typedef {object} FlatEntryPoint
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
		compilerOptions.module != null &&
		compilerOptions.module >= ts.ModuleKind.Node16 &&
		compilerOptions.module <= ts.ModuleKind.NodeNext
	);
}

/**
 * @typedef {object} EntryPoint
 * @property {string} packageName
 * @property {string} mainFile
 */

/**
 * @typedef {object} ConfigurationInput
 * @property {string | undefined} tsConfigFile
 * @property {string}	outputFolder
 * @property {string}	declarationOutputFolder
 * @property {ts.ScriptTarget} target
 * @property {boolean} usePrivateApiAsImportIssueWorkaround
 */

/**
 * @param {import('../context.js').BuildContext} context
 * @param {ConfigurationInput} input
 * @returns {import('@angular/compiler-cli').ParsedConfiguration}
 */
export function parseConfiguration(context, input) {
	const defaultConfiguration = readConfiguration(defaultTsConfigFile);
	const configuration = input.tsConfigFile
		? readConfiguration(input.tsConfigFile)
		: defaultConfiguration;

	const compilerOptions = configuration.options;

	compilerOptions.module = compilerOptions.module ?? ts.ModuleKind.ESNext;

	if (
		compilerOptions.module >= ts.ModuleKind.ES2015 &&
		compilerOptions.module <= ts.ModuleKind.ESNext
	) {
		compilerOptions.moduleResolution =
			compilerOptions.moduleResolution ?? ts.ModuleResolutionKind.Node10;
	} else if (isUsingNodeResolution(compilerOptions)) {
		const primaryType = context.manifest.type ?? 'commonjs';

		if (primaryType !== 'module') {
			throw new BuildFailureError(
				`Compiling angular libraries with TypeScript compiler option "module": "${
					ts.ModuleKind[compilerOptions.module]
				}" currently requires "type": "module" in the package.json for ${
					context.manifest.name
				}`,
			);
		}
	} else {
		throw new BuildFailureError(
			`Expected tsconfig to have module set to "esXXXX" or "node16", but got ${JSON.stringify(
				ts.ModuleKind[compilerOptions.module],
			)}`,
		);
	}

	configuration.emitFlags = defaultConfiguration.emitFlags;

	compilerOptions.outDir = input.outputFolder;
	compilerOptions.sourceRoot = `file:///vendor/${context.manifest.name}`;

	compilerOptions.flatModuleId = undefined;
	compilerOptions.flatModuleOutFile = undefined;

	compilerOptions.compilationMode = 'partial';

	compilerOptions.basePath = context.rootFolder;

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
	compilerOptions.declarationDir = input.declarationOutputFolder;
	compilerOptions.emitDeclarationOnly = false;

	compilerOptions.inlineSourceMap = false;
	compilerOptions.sourceMap = true;
	compilerOptions.declarationMap = true;
	compilerOptions.inlineSources = true;

	configuration.rootNames = context.entryPoints.map(
		(entryPoint) => entryPoint.mainFile,
	);
	if (input.usePrivateApiAsImportIssueWorkaround) {
		// Uh oh, a private property: "This option is internal and is used by the ng_module.bzl rule to switch behavior between Bazel and Blaze."
		compilerOptions._useHostForImportGeneration = true;
	}
	compilerOptions.preserveSymlinks = true;

	compilerOptions.importHelpers = true;

	return configuration;
}
