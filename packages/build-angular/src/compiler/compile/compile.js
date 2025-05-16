/** cspell:ignore ngtsc */

import {createProgram} from "@angular/compiler-cli";
import {posix} from "path";
import ts from "typescript";

import {BuildFailureError} from "../error.js";

import {createCompilerHost} from "./compiler-host.js";
import {collectDiagnostics, reportErrorsAndExit} from "./diagnostics.js";
import {combineTransformers} from "./plugin.js";

/**
 * @typedef {object} Cache
 * @property {import('@angular/compiler-cli').Program=} program
 * @property {import('typescript').ModuleResolutionCache} moduleResolution
 * @property {import('../cache/file.js').FileCache} files
 */

/**
 * @typedef {object} CompileInput
 * @property {Cache} cache
 * @property {import('@angular/compiler-cli').ParsedConfiguration} config
 * @property {boolean} usePrivateApiAsImportIssueWorkaround
 */

/**
 * @param {import('../context.js').BuildContext} context
 * @param {CompileInput} input
 * @returns {Promise<{
 *   writtenFiles: Map<string, string>;
 *   writtenDeclarationFiles: Map<string, string>;
 * }>}
 */
export async function compile(
	context,
	{cache, config, usePrivateApiAsImportIssueWorkaround},
) {
	const {rootNames, options, errors: configErrors, emitFlags} = config;
	if (configErrors.length) {
		reportErrorsAndExit(configErrors, context.logger);
	}

	try {
		const oldProgram = cache.program;

		/** @type {Map<string, string>} */
		const writtenFiles = new Map();
		/** @type {Map<string, string>} */
		const writtenDeclarationFiles = new Map();

		const host = createCompilerHost(context, {
			compilerOptions: config.options,
			moduleResolutionCache: cache.moduleResolution,
			fileCache: cache.files,
			markWrittenFile: (writtenFile, sourceFile) => {
				if (!writtenFile.endsWith(".map")) {
					(/\.d\.[cm]?ts$/.test(writtenFile) ?
						writtenDeclarationFiles
					:	writtenFiles
					).set(sourceFile.fileName, writtenFile);
				}
			},
		});

		const program = createProgram({
			host,
			rootNames,
			options,
			oldProgram,
		});

		await program.loadNgStructureAsync();

		const diagnostics = collectDiagnostics(program);

		const emitResult = program.emit({
			forceEmit: true,
			emitFlags,
			emitCallback: ({
				program,
				cancellationToken,
				customTransformers = {},
				emitOnlyDtsFiles,
				targetSourceFile,
				writeFile,
			}) => {
				return program.emit(
					targetSourceFile,
					writeFile,
					cancellationToken,
					emitOnlyDtsFiles,
					combineTransformers(
						customTransformers,
						fixBrokenImports(host, usePrivateApiAsImportIssueWorkaround),
						context.plugins,
					),
				);
			},
		});

		cache.program = program;

		reportErrorsAndExit(
			[...diagnostics, ...emitResult.diagnostics],
			context.logger,
		);

		return {
			writtenFiles,
			writtenDeclarationFiles,
		};
	} catch (e) {
		// In certain scenarios the angular compiler throws a FatalDiagnosticError,
		// a non-error that can be converted into a diagnostic
		// https://github.com/angular/angular/blob/3a60063a54d850c50ce962a8a39ce01cfee71398/packages/compiler-cli/src/ngtsc/diagnostics/src/error.ts#L14-L28
		if (typeof e === "object" && e != null && "toDiagnostic" in e) {
			reportErrorsAndExit(
				[
					/** @type {{toDiagnostic(): import('typescript').Diagnostic}} */ (
						e
					).toDiagnostic(),
				],
				context.logger,
			);
			throw new BuildFailureError("Fatal diagnostic encountered");
		}

		throw e;
	}
}

/**
 * @param {Required<Pick<import('@angular/compiler-cli').CompilerHost, 'fileNameToModuleName'>>} compilerHost
 * @param {boolean} usePrivateApiAsImportIssueWorkaround
 * @returns {ts.CustomTransformers}
 */
function fixBrokenImports(compilerHost, usePrivateApiAsImportIssueWorkaround) {
	if (usePrivateApiAsImportIssueWorkaround) {
		return {};
	}

	/**
	 * @type {ts.CustomTransformerFactory}
	 */
	let transformerFactory = (context) => {
		/**
		 * @param {ts.SourceFile} sourceFile
		 * @returns {ts.SourceFile}
		 */
		function transformSourceFile(sourceFile) {
			return ts.visitEachChild(
				sourceFile,
				(node) => {
					if (
						// We're looking for imports only
						ts.isImportDeclaration(node) &&
						// The import is a relative path into node_modules (into the .yarn folder for PnP)
						ts.isStringLiteral(node.moduleSpecifier) &&
						node.moduleSpecifier.text.startsWith("../") &&
						// Angular has a specific naming format for these imports
						node.importClause &&
						ts.isImportClause(node.importClause) &&
						node.importClause.namedBindings &&
						ts.isNamespaceImport(node.importClause.namedBindings) &&
						/^i[0-9]+/.test(
							node.importClause.namedBindings.name.escapedText.toString(),
						)
					) {
						const newPath = compilerHost.fileNameToModuleName(
							posix.resolve(
								posix.dirname(sourceFile.fileName),
								node.moduleSpecifier.text,
							),
							sourceFile.fileName,
						);

						if (newPath !== node.moduleSpecifier.text) {
							return context.factory.updateImportDeclaration(
								node,
								node.modifiers,
								node.importClause,
								context.factory.createStringLiteral(newPath),
								node.assertClause,
							);
						}
					}

					return node;
				},
				context,
			);
		}

		return {
			transformSourceFile,
			transformBundle: (bundle) =>
				context.factory.updateBundle(
					bundle,
					bundle.sourceFiles.map(transformSourceFile),
				),
		};
	};

	return {
		after: [transformerFactory],
		afterDeclarations: [transformerFactory],
	};
}
