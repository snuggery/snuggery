import {getPath, ts} from '@snuggery/schematics/typescript';

import type {Trip, TypescriptTransformFactory} from '../types';

interface MapImportsInput {
	moduleSpecifier: string;
	imports: ReadonlyMap<string, {newName?: string; newFrom?: string}>;
}

/**
 * Map imports from the given module onto new modules and/or new names
 *
 * @returns A trip to register in a `journey`
 */
export function mapImports(
	moduleSpecifier: string,
	imports: Iterable<
		[exportName: string, opts: {newName?: string; newFrom?: string}]
	>,
): Trip {
	return {
		configure(journey) {
			journey.typescript.addDeduplicatedTransform(createTypescriptTransform, {
				moduleSpecifier,
				imports: new Map(imports),
			});
		},
	};
}

const createTypescriptTransform: TypescriptTransformFactory<
	MapImportsInput
> = ({context: {logger}, input}) => {
	const importsPerSpecifier = new Map(
		input.map(({imports, moduleSpecifier}) => [moduleSpecifier, imports]),
	);
	const allSpecifiers = new Set(importsPerSpecifier.keys());
	const allSpecifiersArray = Array.from(importsPerSpecifier.keys());

	return context => sourceFile => {
		if (
			!allSpecifiersArray.some(moduleSpecifier =>
				sourceFile.text.includes(moduleSpecifier),
			)
		) {
			return sourceFile;
		}

		const renames = new Map<string, string>();

		// 1. Look through the imports
		//    - Track renames that need to be applied throughout the file
		//    - Replace the old imports with new imports

		sourceFile = ts.visitEachChild(
			sourceFile,
			function handleImports(node) {
				if (
					!ts.isImportDeclaration(node) ||
					!ts.isStringLiteral(node.moduleSpecifier) ||
					!allSpecifiers.has(node.moduleSpecifier.text) ||
					node.importClause == null
				) {
					return node;
				}

				const {importClause} = node;
				if (importClause.name) {
					warnUnsupported(
						`import ${importClause.name.text} from '${node.moduleSpecifier.text}'`,
					);
				}
				if (!importClause.namedBindings) {
					return node;
				}
				if (ts.isNamespaceImport(importClause.namedBindings)) {
					warnUnsupported(
						`import { * as ${importClause.namedBindings.name.text} } from '${node.moduleSpecifier.text}'`,
					);
					return node;
				}

				return replaceImportsOrExports(
					node.moduleSpecifier.text,
					node.importClause,
					importClause.namedBindings,
					context,
					(isTypeOnly, elements) =>
						context.factory.updateImportDeclaration(
							node,
							node.modifiers,
							context.factory.updateImportClause(
								node.importClause!,
								isTypeOnly,
								node.importClause!.name,
								context.factory.createNamedImports(elements),
							),
							node.moduleSpecifier,
							node.assertClause,
						),
					(moduleSpecifier, isTypeOnly, elements) =>
						context.factory.createImportDeclaration(
							undefined,
							context.factory.createImportClause(
								isTypeOnly,
								undefined,
								context.factory.createNamedImports(elements),
							),
							context.factory.createStringLiteral(moduleSpecifier),
							undefined,
						),
					context.factory.updateImportSpecifier,
					renames,
				);
			},
			context,
		);

		// 2. Visit again, replacing all exports

		sourceFile = ts.visitEachChild(
			sourceFile,
			node => {
				// Rename any exports by aliasing them so the old name is kept,
				// because we don't want to start having to track arbitrary imports
				// from all files...

				if (!ts.isExportDeclaration(node)) {
					return node;
				}

				if (!node.moduleSpecifier) {
					if (!node.exportClause || !ts.isNamedExports(node.exportClause)) {
						return node;
					}

					return context.factory.updateExportDeclaration(
						node,
						node.modifiers,
						node.isTypeOnly,
						context.factory.updateNamedExports(
							node.exportClause,
							Array.from(node.exportClause.elements, specifier => {
								const exportName = (specifier.propertyName ?? specifier.name)
									.text;
								const renamedExportName = renames.get(exportName);
								if (renamedExportName == null) {
									return specifier;
								}

								return context.factory.updateExportSpecifier(
									specifier,
									specifier.isTypeOnly,
									renamedExportName === specifier.name.text
										? undefined
										: context.factory.createIdentifier(renamedExportName),
									specifier.name,
								);
							}),
						),
						node.moduleSpecifier,
						node.assertClause,
					);
				} else if (
					!ts.isStringLiteral(node.moduleSpecifier) ||
					!allSpecifiers.has(node.moduleSpecifier.text)
				) {
					return node;
				} else {
					if (!node.exportClause) {
						warnUnsupported(`export * from '${node.moduleSpecifier.text}'`);
						return node;
					}

					if (!ts.isNamedExports(node.exportClause)) {
						return node;
					}

					return replaceImportsOrExports(
						node.moduleSpecifier.text,
						node,
						node.exportClause,
						context,
						(isTypeOnly, elements) =>
							context.factory.updateExportDeclaration(
								node,
								node.modifiers,
								isTypeOnly,
								context.factory.updateNamedExports(
									node.exportClause as ts.NamedExports,
									elements,
								),
								node.moduleSpecifier,
								node.assertClause,
							),
						(moduleSpecifier, isTypeOnly, elements) =>
							context.factory.createExportDeclaration(
								undefined,
								isTypeOnly,
								context.factory.createNamedExports(elements),
								context.factory.createStringLiteral(moduleSpecifier),
								undefined,
							),
						context.factory.updateExportSpecifier,
					);
				}
			},
			context,
		);

		// 3. Now visit the file again, deeply this time, to
		//    - apply the renames listed in the first step
		//    - warn for unhandled dynamic imports
		//    - apply renames to `import('lorem').Ipsum` types

		return ts.visitEachChild(
			sourceFile,
			function visit(node: ts.Node): ts.Node {
				// Import and export declarations have been taken care of

				if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
					return node;
				}

				// Replace imported types

				if (ts.isImportTypeNode(node)) {
					if (
						!ts.isLiteralTypeNode(node.argument) ||
						!ts.isStringLiteral(node.argument.literal) ||
						!allSpecifiers.has(node.argument.literal.text)
					) {
						return node;
					}

					let identifier = node.qualifier;

					if (identifier == null) {
						warnUnsupported(`import('${node.argument.literal.text}')`);
						return node;
					}

					while (!ts.isIdentifier(identifier)) {
						identifier = identifier.left;
					}

					const info = importsPerSpecifier
						.get(node.argument.literal.text)!
						.get(identifier.text);
					if (info == null) {
						return node;
					}

					return context.factory.updateImportTypeNode(
						node,
						info.newFrom
							? context.factory.updateLiteralTypeNode(
									node.argument,
									context.factory.createStringLiteral(info.newFrom),
							  )
							: node.argument,
						node.assertions,
						info.newName
							? ts.visitNode(
									node.qualifier!,
									function replaceLeftMostIdentifier(
										node: ts.EntityName,
									): ts.EntityName {
										if (ts.isIdentifier(node)) {
											return context.factory.createIdentifier(info.newName!);
										}
										return context.factory.updateQualifiedName(
											node,
											ts.visitNode(
												node.left,
												replaceLeftMostIdentifier,
												ts.isQualifiedName,
											),
											node.right,
										);
									},
									ts.isQualifiedName,
							  )
							: node.qualifier,
						node.typeArguments?.map(arg =>
							ts.visitNode(arg, visit, ts.isTypeNode),
						),
						node.isTypeOf,
					);
				}

				// Rename any used imports

				if (ts.isIdentifier(node)) {
					const rename = renames.get(node.text);
					return rename ? context.factory.createIdentifier(rename) : node;
				}

				if (ts.isPropertyAccessExpression(node)) {
					return context.factory.updatePropertyAccessExpression(
						node,
						ts.visitNode(node.expression, visit, ts.isExpression),
						node.name,
					);
				}

				if (ts.isQualifiedName(node)) {
					return context.factory.updateQualifiedName(
						node,
						ts.visitNode(node.left, visit, ts.isEntityName),
						node.right,
					);
				}

				return ts.visitEachChild(node, visit, context);
			},
			context,
		);

		function warnUnsupported(text: string) {
			logger.warn(
				`Import \`${text}\` cannot automatically be transformed in ${getPath(
					sourceFile,
				)}`,
			);
		}
	};

	function replaceImportsOrExports<
		D extends ts.ImportDeclaration | ts.ExportDeclaration,
		T extends ts.NamedImportsOrExports,
	>(
		moduleSpecifier: string,
		clause: T['parent'],
		namedBindings: T,
		context: ts.TransformationContext,
		updateDeclaration: (
			isTypeOnly: boolean,
			elements: T['elements'][number][],
		) => D,
		createDeclaration: (
			moduleSpecifier: string,
			isTypeOnly: boolean,
			elements: T['elements'][number][],
		) => D,
		updateElement: (
			node: T['elements'][number],
			isTypeOnly: boolean,
			propertyName: ts.Identifier | undefined,
			name: ts.Identifier,
		) => T['elements'][number],
		renames?: Map<string, string>,
	) {
		const perModuleSpecifier = new Map<string, T['elements'][number][]>();

		for (const specifier of namedBindings.elements) {
			const exportName = (specifier.propertyName ?? specifier.name).text;
			const renameOptions = importsPerSpecifier
				.get(moduleSpecifier)!
				.get(exportName);

			if (renameOptions == null) {
				continue;
			}

			const newExportName = renameOptions.newName ?? exportName;
			const newFrom = renameOptions.newFrom ?? moduleSpecifier;

			let newElements = perModuleSpecifier.get(newFrom);
			if (newElements == null) {
				newElements = [];
				perModuleSpecifier.set(newFrom, newElements);
			}

			if (newExportName === exportName) {
				// Import didn't change
				newElements.push(specifier);
			} else if (specifier.propertyName == null) {
				if (renames) {
					// Import was not aliased, so we need to rename all usage of
					// this import everywhere
					renames?.set(exportName, newExportName);
					newElements.push(
						updateElement(
							specifier,
							specifier.isTypeOnly,
							undefined,
							context.factory.createIdentifier(newExportName),
						),
					);
				} else {
					// Export was not aliased, so alias it
					newElements.push(
						updateElement(
							specifier,
							specifier.isTypeOnly,
							context.factory.createIdentifier(newExportName),
							context.factory.createIdentifier(exportName),
						),
					);
				}
			} else {
				// Import was aliased, so we don't need to rename usage
				newElements.push(
					updateElement(
						specifier,
						specifier.isTypeOnly,
						// If the alias is the new name, we can remove the alias
						specifier.name.text === newExportName ? undefined : specifier.name,
						context.factory.createIdentifier(newExportName),
					),
				);
			}
		}

		return Array.from(perModuleSpecifier, ([ms, specifiers]) => {
			const isTypeOnly = specifiers.every(is => is.isTypeOnly);
			if (isTypeOnly) {
				specifiers = specifiers.map(is =>
					updateElement(is, false, is.propertyName, is.name),
				);
			}

			if (ms === moduleSpecifier) {
				return updateDeclaration(isTypeOnly || clause.isTypeOnly, specifiers);
			} else {
				return createDeclaration(ms, isTypeOnly, specifiers);
			}
		});
	}
};
