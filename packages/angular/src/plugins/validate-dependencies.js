import {isJsonObject} from '@snuggery/core';
import {createRequire} from 'node:module';
import ts from 'typescript';

import {BuildFailureError} from '../compiler.js';

/**
 * @typedef {object} ValidateDependenciesInput
 * @property {readonly string[]} [allowedUnusedDependencies]
 * @property {boolean} [warnOnly]
 */

/**
 * @type {import("../compiler.js").CompilerPluginFactory<ValidateDependenciesInput>}
 */
export const validateDependencies = {
	name: 'validateDependencies',
	create({logger, primaryEntryPoint}, options = {}) {
		/** @type {Set<string>} */
		const usedDependencies = new Set();
		/** @type {Set<string>} */
		const declaredDependencies = new Set();
		/** @type {Set<string>} */
		const transitivePeerDependencies = new Set();
		const allowedUnusedDependencies = new Set(
			options.allowedUnusedDependencies,
		);

		const require = createRequire(primaryEntryPoint.manifestFile);

		/** @type {ts.CustomTransformerFactory} */
		const collectUsedDependencies = context => {
			/** @type {ts.CustomTransformer} */
			const collector = {
				transformSourceFile(sourceFile) {
					return ts.visitEachChild(
						sourceFile,
						/** @returns {ts.Node} */ function visitNode(node) {
							if (
								ts.isImportDeclaration(node) ||
								ts.isExportDeclaration(node)
							) {
								if (
									node.moduleSpecifier &&
									ts.isStringLiteral(node.moduleSpecifier) &&
									!/^\.\.?\//.test(node.moduleSpecifier.text)
								) {
									usedDependencies.add(node.moduleSpecifier.text);
								}

								return node;
							}

							if (ts.isImportTypeNode(node)) {
								if (
									ts.isLiteralTypeNode(node.argument) &&
									ts.isStringLiteral(node.argument.literal) &&
									!/^\.\.?\//.test(node.argument.literal.text)
								) {
									usedDependencies.add(node.argument.literal.text);
								}
							}

							return ts.visitEachChild(node, visitNode, context);
						},
						context,
					);
				},
				transformBundle(bundle) {
					for (const sourceFile of bundle.sourceFiles) {
						collector.transformSourceFile(sourceFile);
					}

					return bundle;
				},
			};

			return collector;
		};

		return {
			typescriptTransformers: {
				after: [collectUsedDependencies],
				afterDeclarations: [collectUsedDependencies],
			},
			processManifest(manifest) {
				if (isJsonObject(manifest.peerDependencies)) {
					for (const name of Object.keys(manifest.peerDependencies)) {
						declaredDependencies.add(name);
					}
				}

				if (isJsonObject(manifest.dependencies)) {
					for (const name of Object.keys(manifest.dependencies)) {
						declaredDependencies.add(name);

						const dependencyManifest =
							/** @type {import('@snuggery/core').JsonObject} */ (
								require(`${name}/package.json`)
							);

						if (isJsonObject(dependencyManifest.peerDependencies)) {
							for (const transitivePeerName of Object.keys(
								dependencyManifest.peerDependencies,
							)) {
								transitivePeerDependencies.add(transitivePeerName);
							}
						}
					}
				}
			},
			finalize() {
				let hasError = false;

				logger.info('Validating dependencies...');

				for (const usedDependency of usedDependencies) {
					if (declaredDependencies.has(usedDependency)) {
						logger.debug(`Used dependency ${usedDependency} is declared`);
					} else {
						logger.error(
							`Dependency ${usedDependency} is used but not declared`,
						);
						hasError = true;
					}
				}

				for (const declaredDependency of declaredDependencies) {
					if (usedDependencies.has(declaredDependency)) {
						logger.debug(`Declared dependency ${declaredDependency} is used`);
					} else if (transitivePeerDependencies.has(declaredDependency)) {
						logger.debug(
							`Declared dependency ${declaredDependency} is a peer dependency of a dependency`,
						);
					} else if (allowedUnusedDependencies.has(declaredDependency)) {
						logger.debug(
							`Declared dependency ${declaredDependency} is unused but allowlisted as unused dependency`,
						);
					} else {
						logger.error(
							`Declared dependency ${declaredDependency} is not used`,
						);
						hasError = true;
					}
				}

				if (hasError && !options.warnOnly) {
					throw new BuildFailureError(`Dependency validation failed`);
				}
			},
		};
	},
};
