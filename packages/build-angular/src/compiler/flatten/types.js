/* cspell:word tsdoc */

import {rm, writeFile} from 'node:fs/promises';
import {dirname, join, relative} from 'node:path';

import {BuildFailureError} from '../error.js';
import {ensureUnixPath} from '../utils.js';

/**
 * @typedef {object} FlattenTypesInput
 * @property {string} outputFolder
 * @property {string} declarationOutputFolder
 * @property {boolean} enableApiExtractor
 */

/**
 * @param {typeof import('@microsoft/api-extractor')} apiExtractor
 * @param {import('../context.js').BuildContext<string>} context
 * @param {import('../context.js').EntryPoint<string>} entryPoint
 * @param {string} declarationOutputFolder
 * @param {string} flattenedDeclarationFile
 */
function createConfig(
	apiExtractor,
	context,
	entryPoint,
	declarationOutputFolder,
	flattenedDeclarationFile,
) {
	return apiExtractor.ExtractorConfig.prepare({
		configObject: {
			dtsRollup: {
				enabled: true,
				publicTrimmedFilePath: flattenedDeclarationFile,
			},
			docModel: {
				enabled: false,
			},
			tsdocMetadata: {
				enabled: false,
			},

			compiler: {
				overrideTsconfig: {
					files: [entryPoint.declarationFile],
					compilerOptions: {
						lib: ['es2022', 'dom', 'dom.iterable'],
					},
				},
			},

			apiReport: {
				enabled: false,
				reportFileName: 'this property is required but not used',
			},

			projectFolder: declarationOutputFolder,
			mainEntryPointFilePath: entryPoint.declarationFile,
		},
		configObjectFullPath: undefined,
		// file doesn't exist, but we need to pass it in order for API Extractor
		// to recognize the packageJson value we pass
		packageJsonFullPath: join(declarationOutputFolder, 'package.json'),
		// API Extractor expects valid NPM package names, so use the main package name
		packageJson: {name: context.manifest.name},
	});
}

/**
 * @param {import('../context.js').BuildContext<string>} context
 * @param {FlattenTypesInput} input
 */
async function reExportTypes(context, input) {
	for (const entryPoint of context.entryPoints) {
		const newDeclarationFile = join(
			input.outputFolder,
			`${entryPoint.exportName === '.' ? 'index' : entryPoint.exportName}.d.ts`,
		);

		await writeFile(
			newDeclarationFile,
			`export * from './${ensureUnixPath(
				relative(
					dirname(newDeclarationFile),
					entryPoint.declarationFile.replace(/\.d\.([mc]?)ts$/, '.$1js'),
				),
			)}';\n`,
		);

		entryPoint.declarationFile = newDeclarationFile;
	}
}

/**
 * @param {import('../context.js').BuildContext<string>} context
 * @param {FlattenTypesInput} input
 */
export async function flattenTypes(context, input) {
	if (!input.enableApiExtractor) {
		await reExportTypes(context, input);
		return;
	}

	const apiExtractor = await import('@microsoft/api-extractor');

	for (const entryPoint of context.entryPoints) {
		const flattenedDeclarationFile = join(
			input.outputFolder,
			`${entryPoint.exportName === '.' ? 'index' : entryPoint.exportName}.d.ts`,
		);

		const {succeeded} = apiExtractor.Extractor.invoke(
			createConfig(
				apiExtractor,
				context,
				entryPoint,
				input.declarationOutputFolder,
				flattenedDeclarationFile,
			),
			{
				messageCallback(message) {
					message.handled = true;

					if (
						message.messageId === 'console-compiler-version-notice' ||
						message.messageId === 'console-preamble'
					) {
						return;
					}

					switch (message.logLevel) {
						case 'none':
							break;
						case 'verbose':
							context.logger.debug(message.text);
							break;
						case 'warning':
							context.logger.warn(message.text);
							break;
						case 'error':
							context.logger.error(message.text);
							break;
						case 'info':
						default:
							context.logger.info(message.text);
							break;
					}
				},
			},
		);

		if (!succeeded) {
			throw new BuildFailureError(`Bundling .d.ts files failed`);
		}

		entryPoint.declarationFile = flattenedDeclarationFile;
	}

	await rm(input.declarationOutputFolder, {recursive: true});
}
