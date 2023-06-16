import {Trip, getContext} from '@snuggery/journey';
import {
	VisitorFactory,
	visitTypescriptFiles,
	ts,
	getPath,
} from '@snuggery/journey/agents/typescript';

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
		prepare(journey) {
			visitTypescriptFiles(journey, createTypescriptTransform, {
				moduleSpecifier,
				imports: new Map(imports),
			});
		},
	};
}

const createTypescriptTransform: VisitorFactory<MapImportsInput> = (
	input,
	journey,
) => {
	const {logger} = getContext(journey);

	const importsPerSpecifier = new Map(
		input.map(({imports, moduleSpecifier}) => [moduleSpecifier, imports]),
	);
	const allSpecifiers = new Set(importsPerSpecifier.keys());
	const allSpecifiersArray = Array.from(importsPerSpecifier.keys());

	return (sourceFile, recorder) => {
		if (
			!allSpecifiersArray.some(moduleSpecifier =>
				sourceFile.text.includes(moduleSpecifier),
			)
		) {
			return;
		}

		const renames = new Map<string, string>();

		// 1. Look through the imports
		//    - Track renames that need to be applied throughout the file
		//    - Replace the old imports with new imports

		ts.forEachChild(sourceFile, function handleImports(node): void {
			if (
				!ts.isImportDeclaration(node) ||
				!ts.isStringLiteral(node.moduleSpecifier) ||
				!allSpecifiers.has(node.moduleSpecifier.text) ||
				node.importClause == null
			) {
				return;
			}

			const {importClause} = node;
			if (importClause.name) {
				warnUnsupported(
					`import ${importClause.name.text} from '${node.moduleSpecifier.text}'`,
				);
			}
			if (!importClause.namedBindings) {
				return;
			}
			if (ts.isNamespaceImport(importClause.namedBindings)) {
				warnUnsupported(
					`import { * as ${importClause.namedBindings.name.text} } from '${node.moduleSpecifier.text}'`,
				);
				return;
			}

			replaceImportsOrExports(
				node,
				node.moduleSpecifier.text,
				node.importClause,
				importClause.namedBindings,
				(isTypeOnly, elements) =>
					ts.factory.updateImportDeclaration(
						node,
						node.modifiers,
						ts.factory.updateImportClause(
							node.importClause!,
							isTypeOnly,
							node.importClause!.name,
							ts.factory.createNamedImports(elements),
						),
						node.moduleSpecifier,
						node.assertClause,
					),
				(moduleSpecifier, isTypeOnly, elements) =>
					ts.factory.createImportDeclaration(
						undefined,
						ts.factory.createImportClause(
							isTypeOnly,
							undefined,
							ts.factory.createNamedImports(elements),
						),
						ts.factory.createStringLiteral(moduleSpecifier),
						undefined,
					),
				ts.factory.updateImportSpecifier,
				renames,
			);
		});

		// 2. Visit again, replacing all exports

		ts.forEachChild(sourceFile, (node): void => {
			// Rename any exports by aliasing them so the old name is kept,
			// because we don't want to start having to track arbitrary imports
			// from all files...

			if (!ts.isExportDeclaration(node)) {
				return;
			}

			if (!node.moduleSpecifier) {
				if (!node.exportClause || !ts.isNamedExports(node.exportClause)) {
					return;
				}

				for (const specifier of node.exportClause.elements) {
					const exportName = (specifier.propertyName ?? specifier.name).text;
					const renamedExportName = renames.get(exportName);

					if (renamedExportName) {
						recorder.replace(
							specifier,
							ts.factory.updateExportSpecifier(
								specifier,
								specifier.isTypeOnly,
								renamedExportName === specifier.name.text
									? undefined
									: ts.factory.createIdentifier(renamedExportName),
								specifier.name,
							),
						);
					}
				}
			} else if (
				!ts.isStringLiteral(node.moduleSpecifier) ||
				!allSpecifiers.has(node.moduleSpecifier.text)
			) {
				return;
			} else {
				if (!node.exportClause) {
					warnUnsupported(`export * from '${node.moduleSpecifier.text}'`);
					return;
				}

				if (!ts.isNamedExports(node.exportClause)) {
					return;
				}

				replaceImportsOrExports(
					node,
					node.moduleSpecifier.text,
					node,
					node.exportClause,
					(isTypeOnly, elements) =>
						ts.factory.updateExportDeclaration(
							node,
							node.modifiers,
							isTypeOnly,
							ts.factory.updateNamedExports(
								node.exportClause as ts.NamedExports,
								elements,
							),
							node.moduleSpecifier,
							node.assertClause,
						),
					(moduleSpecifier, isTypeOnly, elements) =>
						ts.factory.createExportDeclaration(
							undefined,
							isTypeOnly,
							ts.factory.createNamedExports(elements),
							ts.factory.createStringLiteral(moduleSpecifier),
							undefined,
						),
					ts.factory.updateExportSpecifier,
				);
			}
		});

		// 3. Now visit the file again, deeply this time, to
		//    - apply the renames listed in the first step
		//    - warn for unhandled dynamic imports
		//    - apply renames to `import('lorem').Ipsum` types

		ts.forEachChild(sourceFile, function visit(node: ts.Node): void {
			// Import and export declarations have been taken care of

			if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
				return;
			}

			// Replace imported types

			if (ts.isImportTypeNode(node)) {
				if (
					!ts.isLiteralTypeNode(node.argument) ||
					!ts.isStringLiteral(node.argument.literal) ||
					!allSpecifiers.has(node.argument.literal.text)
				) {
					return;
				}

				let identifier = node.qualifier;

				if (identifier == null) {
					warnUnsupported(`import('${node.argument.literal.text}')`);
					return;
				}

				while (!ts.isIdentifier(identifier)) {
					identifier = identifier.left;
				}

				const info = importsPerSpecifier
					.get(node.argument.literal.text)!
					.get(identifier.text);
				if (info == null) {
					return;
				}

				if (info.newFrom) {
					recorder.replace(
						node.argument,
						ts.factory.createStringLiteral(info.newFrom),
					);
				}

				if (info.newName) {
					let qualifier = node.qualifier!;
					while (ts.isQualifiedName(qualifier)) {
						qualifier = qualifier.left;
					}

					recorder.replace(qualifier, info.newName);
				}

				node.typeArguments?.forEach(arg => visit(arg));

				return;
			}

			// Rename any used imports

			if (ts.isIdentifier(node)) {
				const rename = renames.get(node.text);
				if (rename) {
					recorder.replace(node, rename);
				}
				return;
			}

			if (ts.isPropertyAccessExpression(node)) {
				visit(node.expression);
				return;
			}

			if (ts.isQualifiedName(node)) {
				visit(node.left);
				return;
			}

			ts.forEachChild(node, visit);
		});

		function warnUnsupported(text: string) {
			logger.warn(
				`Import \`${text}\` cannot automatically be transformed in ${getPath(
					sourceFile,
				)}`,
			);
		}

		function replaceImportsOrExports<
			D extends ts.ImportDeclaration | ts.ExportDeclaration,
			T extends ts.NamedImportsOrExports,
		>(
			declaration: D,
			moduleSpecifier: string,
			clause: T['parent'],
			namedBindings: T,
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
		): void {
			const perModuleSpecifier = new Map<string, T['elements'][number][]>();
			function getElements(specifier: string) {
				let elements = perModuleSpecifier.get(specifier);
				if (elements == null) {
					elements = [];
					perModuleSpecifier.set(specifier, elements);
				}
				return elements;
			}

			for (const specifier of namedBindings.elements) {
				const exportName = (specifier.propertyName ?? specifier.name).text;
				const renameOptions = importsPerSpecifier
					.get(moduleSpecifier)!
					.get(exportName);

				if (renameOptions == null) {
					getElements(moduleSpecifier).push(specifier);
					continue;
				}

				const newExportName = renameOptions.newName ?? exportName;
				const newFrom = renameOptions.newFrom ?? moduleSpecifier;

				const newElements = getElements(newFrom);

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
								ts.factory.createIdentifier(newExportName),
							),
						);
					} else {
						// Export was not aliased, so alias it
						newElements.push(
							updateElement(
								specifier,
								specifier.isTypeOnly,
								ts.factory.createIdentifier(newExportName),
								ts.factory.createIdentifier(exportName),
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
							specifier.name.text === newExportName
								? undefined
								: ts.factory.createIdentifier(newExportName),
							specifier.name,
						),
					);
				}
			}

			const location = declaration.getStart(sourceFile);
			recorder.remove(declaration);
			let first = true;

			// eslint-disable-next-line prefer-const
			for (let [ms, specifiers] of perModuleSpecifier) {
				if (!first) {
					recorder.insertRight(location, '\n');
				}
				first = false;

				const isTypeOnly = specifiers.every(is => is.isTypeOnly);
				if (isTypeOnly) {
					specifiers = specifiers.map(is =>
						updateElement(is, false, is.propertyName, is.name),
					);
				}

				recorder.insertRight(
					location,
					ms === moduleSpecifier
						? updateDeclaration(isTypeOnly || clause.isTypeOnly, specifiers)
						: createDeclaration(ms, isTypeOnly, specifiers),
				);
			}
		}
	};
};
