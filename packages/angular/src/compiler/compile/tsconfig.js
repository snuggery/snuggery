/* cspell:ignore ngfactory bazel */

import {readConfiguration} from '@angular/compiler-cli';
import {basename, dirname} from 'node:path';
import {fileURLToPath, URL} from 'node:url';

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
 * @property {import('typescript').ScriptTarget} target
 * @property {boolean} usePrivateApiAsImportIssueWorkaround
 */

/**
 * @typedef {object} EntryPoint
 * @property {string} packageName
 * @property {string} outputFolder
 */

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

	configuration.emitFlags = defaultConfiguration.emitFlags;

	if (input.usePrivateApiAsImportIssueWorkaround) {
		configuration.options.rootDir = dirname(input.mainFile);
	}
	configuration.options.outDir = dirname(input.outputFile);
	configuration.options.sourceRoot = `file:///vendor/${input.packageName}`;

	configuration.options.flatModuleId = input.packageName;
	configuration.options.flatModuleOutFile = basename(input.outputFile);

	configuration.options.enableIvy = true;
	configuration.options.compilationMode = 'partial';

	configuration.options.basePath = input.rootFolder;

	configuration.options.paths = {
		...configuration.options.paths,
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
	configuration.options.noEmitOnError = false;

	configuration.options.target = input.target;
	configuration.options.declaration = true;
	configuration.options.declarationDir = dirname(input.declarationOutputFile);
	configuration.options.emitDeclarationOnly = false;

	configuration.options.inlineSourceMap = false;
	configuration.options.sourceMap = true;
	configuration.options.declarationMap = true;
	configuration.options.inlineSources = true;

	configuration.rootNames = [input.mainFile];
	if (input.usePrivateApiAsImportIssueWorkaround) {
		// Uh oh, a private property: "This option is internal and is used by the ng_module.bzl rule to switch behavior between Bazel and Blaze."
		configuration.options._useHostForImportGeneration = true;
	}
	configuration.options.preserveSymlinks = true;

	return configuration;
}
