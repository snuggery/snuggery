import {BuildFailureError} from '../error.js';

/**
 * @param {object} input
 * @param {import('@angular/compiler-cli').CompilerHost} input.compilerHost
 * @param {import('../manifest.js').Manifest} input.primaryManifest
 * @param {string} input.outputFile
 * @returns {import('@angular/compiler-cli').CompilerHost['writeFile']}
 */
export function disallowCjsWriteFileFactory({
	compilerHost,
	primaryManifest,
	outputFile,
}) {
	return (fileName, text, writeBOM, onError, sourceFiles, data) => {
		if (
			fileName.endsWith('.cjs') ||
			(primaryManifest.type !== 'module' && fileName.endsWith('.js'))
		) {
			(onError ?? defaultOnError)(
				`Angular packages may only contain ESM files`,
			);
		}

		if (fileName === outputFile) {
			// Angular seems to generate CJS code instead of ESM, see angular/angular#46181
			//
			// Thankfully the bundle index itself is valid javascript (apart from the missing file
			// extension but let's ignore that for now) so replace the text with the original source

			if (sourceFiles?.length !== 1) {
				// Explicitly not a BuildFailureError
				throw new Error('Failed to find generated bundle index');
			}

			text = /** @type {import('typescript').SourceFile} */ (sourceFiles[0])
				.text;
		}

		return compilerHost.writeFile(
			fileName,
			text,
			writeBOM,
			onError,
			sourceFiles,
			data,
		);
	};
}

/**
 * @param {string} message
 * @returns {void}
 */
function defaultOnError(message) {
	throw new BuildFailureError(message);
}
