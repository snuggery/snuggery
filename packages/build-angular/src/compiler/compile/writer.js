import {BuildFailureError} from "../error.js";

/**
 * @param {import('../context.js').BuildContext} context
 * @param {import('@angular/compiler-cli').CompilerHost} compilerHost
 * @returns {import('@angular/compiler-cli').CompilerHost['writeFile']}
 */
export function disallowCjsWriteFileFactory(context, compilerHost) {
	return (fileName, text, writeBOM, onError, sourceFiles, data) => {
		if (
			fileName.endsWith(".cjs") ||
			(context.manifest.type !== "module" && fileName.endsWith(".js"))
		) {
			(onError ?? defaultOnError)(
				`Angular packages may only contain ESM files`,
			);
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
