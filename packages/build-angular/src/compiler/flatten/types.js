/* cspell:word tsdoc */

import {rm, writeFile} from 'node:fs/promises';
import {dirname, join, relative} from 'node:path';

import {BuildFailureError} from '../error.js';
import {ensureUnixPath} from '../utils.js';

/**
 * @typedef {object} FlattenTypesInput
 * @property {string} definitionFolder
 * @property {string} mainDefinitionFile
 * @property {string} outputFile
 * @property {boolean} enableApiExtractor
 */

/**
 * @param {typeof import('@microsoft/api-extractor')} apiExtractor
 * @param {import('../context.js').BuildContext} context
 * @param {FlattenTypesInput} input
 */
function createConfig(
	apiExtractor,
	context,
	{mainDefinitionFile, definitionFolder, outputFile},
) {
	return apiExtractor.ExtractorConfig.prepare({
		configObject: {
			dtsRollup: {
				enabled: true,
				publicTrimmedFilePath: outputFile,
			},
			docModel: {
				enabled: false,
			},
			tsdocMetadata: {
				enabled: false,
			},

			compiler: {
				overrideTsconfig: {
					files: [mainDefinitionFile],
					compilerOptions: {
						lib: ['es2022', 'dom', 'dom.iterable'],
					},
				},
			},

			apiReport: {
				enabled: false,
				reportFileName: 'this property is required but not used',
			},

			projectFolder: definitionFolder,
			mainEntryPointFilePath: mainDefinitionFile,
		},
		configObjectFullPath: undefined,
		// file doesn't exist, but we need to pass it in order for API Extractor
		// to recognize the packageJson value we pass
		packageJsonFullPath: join(definitionFolder, 'package.json'),
		// API Extractor expects valid NPM package names, so use the main package name
		packageJson: {name: context.primaryEntryPoint.packageName},
	});
}

/**
 * @param {FlattenTypesInput} input
 */
async function reExportTypes(input) {
	await writeFile(
		input.outputFile,
		`export * from './${ensureUnixPath(
			relative(
				dirname(input.outputFile),
				input.mainDefinitionFile.replace(/\.d\.([mc]?)ts$/, '.$1js'),
			),
		)}';\n`,
	);
}

/**
 * @param {import('../context.js').BuildContext} context
 * @param {FlattenTypesInput} input
 */
export async function flattenTypes(context, input) {
	if (!input.enableApiExtractor) {
		await reExportTypes(input);
		return;
	}

	const apiExtractor = await import('@microsoft/api-extractor');

	const {succeeded} = apiExtractor.Extractor.invoke(
		createConfig(apiExtractor, context, input),
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

	await rm(input.definitionFolder, {recursive: true});
}
