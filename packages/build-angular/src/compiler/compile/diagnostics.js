import {formatDiagnostics, exitCodeFromResult} from '@angular/compiler-cli';
import {posix} from 'node:path';

import {BuildFailureError} from '../error.js';

/**
 * @param {import('typescript').Diagnostic} diagnostic
 */
function isMissingExport(diagnostic) {
	return diagnostic.code === -993001;
}

/**
 * @param {import('typescript').CompilerOptions} compilerOptions
 * @param {string} mainFile
 * @param {string=} file
 */
function isPartOfCompilationUnit({rootDir, rootDirs}, mainFile, file) {
	if (!file) {
		return true;
	}

	if (rootDir || rootDirs) {
		if (rootDir) {
			const relative = posix.relative(rootDir, file);
			if (!relative.startsWith('../')) {
				return true;
			}
		}

		if (rootDirs) {
			for (const rootDir of rootDirs) {
				const relative = posix.relative(rootDir, file);
				if (!relative.startsWith('../')) {
					return true;
				}
			}
		}

		return false;
	}

	return !posix.relative(posix.dirname(mainFile), file).startsWith('../');
}

/**
 * @param {import('@angular/compiler-cli').Program} program
 * @returns {readonly import('typescript').Diagnostic[]}
 */
export function collectDiagnostics(program) {
	const compilerOptions = program.getTsProgram().getCompilerOptions();
	const [mainFile] = /** @type {readonly [string, ...string[]]} */ (
		program.getTsProgram().getRootFileNames()
	);

	const diagnostics = [
		...program.getTsOptionDiagnostics(),
		...program.getNgOptionDiagnostics(),

		...program.getTsSyntacticDiagnostics(),
		...program.getTsSemanticDiagnostics(),
		...program.getNgSemanticDiagnostics(),
		...program.getNgStructuralDiagnostics(),
	];

	return diagnostics.filter(diagnostic => {
		// Angular complains about missing imports of components or modules,
		// because it doesn't think the dependencies are built to the APF
		// specification. We know they are, so ignore those errors.
		if (isMissingExport(diagnostic)) {
			// Only ignore them if the import comes from a dependency though,
			// otherwise we allow packages that forget to export their own
			// directives/components/modules/pipes to build successfully.
			return isPartOfCompilationUnit(
				compilerOptions,
				mainFile,
				diagnostic.file?.fileName,
			);
		}

		return true;
	});
}

/**
 * @param {readonly import('typescript').Diagnostic[]} diagnostics
 * @param {import('../logger.js').Logger} logger
 */
export function reportErrorsAndExit(diagnostics, logger) {
	if (diagnostics.length === 0) {
		return;
	}

	// formatDiagnostics takes care of coloring the output
	logger.info(formatDiagnostics(diagnostics));

	if (exitCodeFromResult(diagnostics) !== 0) {
		throw new BuildFailureError('Compilation failed, see errors above');
	}
}
