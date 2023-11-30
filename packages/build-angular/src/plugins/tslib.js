import {isJsonObject} from '@snuggery/core';
import ts from 'typescript';

/**
 * @typedef {object} TslibOptions
 * @property {string} [version]
 */

/**
 * @type {import("../compiler.js").CompilerPluginFactory<TslibOptions>}
 */
export const tslib = {
	name: 'tslib',
	create({logger}, {version = '^2.6.2'} = {}) {
		let isTslibUsed = false;

		/** @type {ts.TransformerFactory<ts.SourceFile>} */
		const checkIfTslibIsUsed = (context) => (sourceFile) => {
			if (isTslibUsed) {
				return sourceFile;
			}

			return ts.visitEachChild(
				sourceFile,
				function visitNode(node) {
					if (
						ts.isImportDeclaration(node) &&
						ts.isStringLiteral(node.moduleSpecifier) &&
						node.moduleSpecifier.text === 'tslib'
					) {
						isTslibUsed = true;
					}

					return node;
				},
				context,
			);
		};

		return {
			typescriptTransformers: {
				after: [checkIfTslibIsUsed],
			},
			processManifest(manifest) {
				if (isTslibUsed) {
					if (
						isJsonObject(manifest.dependencies) &&
						manifest.dependencies.tslib
					) {
						logger.debug(
							'Dependency on tslib was already present, keeping that one...',
						);
					} else {
						logger.info('Adding tslib dependency...');
						manifest.dependencies = isJsonObject(manifest.dependencies)
							? {
									...manifest.dependencies,
									tslib: version,
							  }
							: {
									tslib: version,
							  };
					}
				} else {
					if (
						isJsonObject(manifest.dependencies) &&
						manifest.dependencies.tslib
					) {
						logger.info('Removing superfluous dependency on tslib...');
						if (Object.keys(manifest.dependencies).length > 1) {
							delete manifest.dependencies.tslib;
						} else {
							delete manifest.dependencies;
						}
					} else {
						logger.debug('No dependency on tslib required or present...');
					}
				}
			},
		};
	},
};
