import type {UpdateRecorder} from '@angular-devkit/schematics';
import {getWorkspace, walkTree} from '@snuggery/schematics';
import {
	ts,
	createSystem,
	createProgram,
	getPath,
	formatDiagnosticsHost,
} from '@snuggery/schematics/typescript';
import {extname, join} from 'node:path/posix';

import {Journey, registerGuide, getContext, getTree} from '../types';
import {Map, WeakMap} from '../utils';

export {ts, getPath};

interface Runner {
	(
		visitors: ((
			sourceFile: ts.SourceFile,
			recorder: TypescriptUpdateRecorder,
		) => void)[],
		transforms: ts.TransformerFactory<ts.SourceFile>[],
	): void | Promise<void>;
}

export interface Visitor {
	(sourceFile: ts.SourceFile, recorder: TypescriptUpdateRecorder): void;
}

export interface VisitorFactory<I> {
	(input: I[], journey: Journey): Visitor;
}

export type TransformerFactory = ts.TransformerFactory<ts.SourceFile>;

export interface TransformerFactoryFactory<I> {
	(input: I[], journey: Journey): TransformerFactory;
}

const visitors = new WeakMap<Journey, Map<VisitorFactory<unknown>, unknown[]>>(
	() => new Map(() => []),
);

const transforms = new WeakMap<
	Journey,
	Map<TransformerFactoryFactory<unknown>, unknown[]>
>(() => new Map(() => []));

const runners = new WeakMap<Journey, Runner>(createSimpleRunner);

const programs = new globalThis.WeakMap<
	Journey,
	{program: ts.Program; typeChecker: ts.TypeChecker}
>();

export interface TypescriptUpdateRecorder extends UpdateRecorder {
	replace(node: ts.Node, newNode: ts.Node | string): this;

	insertLeft(index: number, content: ts.Node | Buffer | string): this;
	insertRight(index: number, content: ts.Node | Buffer | string): this;

	remove(node: ts.Node): this;
	remove(index: number, length: number): this;
}

function createTypescriptUpdateRecorder(
	sourceFile: ts.SourceFile,
	updateRecorder: UpdateRecorder,
): TypescriptUpdateRecorder {
	let printer: ts.Printer | undefined;

	function stringify(value: ts.Node | Buffer | string): string {
		if (typeof value === 'string') {
			return value;
		}

		if (Buffer.isBuffer(value)) {
			return value.toString('utf-8');
		}

		return (printer ??= ts.createPrinter()).printNode(
			ts.EmitHint.Unspecified,
			value,
			sourceFile,
		);
	}

	return {
		insertLeft(index, content) {
			updateRecorder.insertLeft(index, stringify(content));
			return this;
		},
		insertRight(index, content) {
			updateRecorder.insertRight(index, stringify(content));
			return this;
		},

		remove(arg: ts.Node | number, length?: number) {
			if (typeof arg === 'number') {
				updateRecorder.remove(arg, length!);
			} else {
				updateRecorder.remove(
					arg.getStart(sourceFile, true),
					arg.getWidth(sourceFile),
				);
			}
			return this;
		},

		replace(node, newNode) {
			const start = node.getStart(sourceFile, false);
			updateRecorder
				.remove(start, node.getWidth(sourceFile))
				.insertRight(start, stringify(newNode));

			return this;
		},
	};
}

export function visitTypescriptFiles(journey: Journey, visitor: Visitor): void;
// eslint-disable-next-line @typescript-eslint/ban-types
export function visitTypescriptFiles<I extends {}>(
	journey: Journey,
	visitor: VisitorFactory<I>,
	input: I,
): void;
export function visitTypescriptFiles(
	journey: Journey,
	visitor: Visitor | VisitorFactory<unknown>,
	input?: unknown,
): void {
	registerGuide(journey, typescriptGuide);

	if (input != null) {
		visitors
			.get(journey)
			.get(visitor as VisitorFactory<unknown>)
			.push(input);
	} else {
		visitors.get(journey).set(() => visitor as Visitor, []);
	}
}

export function typeCheck(journey: Journey): {
	readonly program: ts.Program;
	readonly typeChecker: ts.TypeChecker;
} {
	const existingProgram = programs.get(journey);
	if (existingProgram != null) {
		return existingProgram;
	}

	const {runner, ...program} = createTypeCheckedRunner(journey);
	programs.set(journey, program);
	runners.set(journey, runner);

	return program;
}

export function transformTypescriptFiles(
	journey: Journey,
	transform: TransformerFactory,
): void;
// eslint-disable-next-line @typescript-eslint/ban-types
export function transformTypescriptFiles<I extends {}>(
	journey: Journey,
	transform: TransformerFactoryFactory<I>,
	input: I,
): void;
export function transformTypescriptFiles(
	journey: Journey,
	transform: TransformerFactory | TransformerFactoryFactory<unknown>,
	input?: unknown,
): void {
	registerGuide(journey, typescriptGuide);

	if (input != null) {
		transforms
			.get(journey)
			.get(transform as TransformerFactoryFactory<unknown>)
			.push(input);
	} else {
		transforms.get(journey).set(() => transform as TransformerFactory, []);
	}
}

async function typescriptGuide(journey: Journey): Promise<void> {
	const runner = runners.get(journey);

	await runner(
		Array.from(visitors.get(journey), ([visitor, input]) =>
			visitor(input, journey),
		),
		Array.from(transforms.get(journey), ([transform, input]) =>
			transform(input, journey),
		),
	);
}

function createSimpleRunner(journey: Journey) {
	return (
		visitors: ((
			sourceFile: ts.SourceFile,
			recorder: TypescriptUpdateRecorder,
		) => void)[],
		transforms: ts.TransformerFactory<ts.SourceFile>[],
	) => {
		const tree = getTree(journey);
		const context = getContext(journey);
		const printer = ts.createPrinter();

		const formatDiagnosticsHost: ts.FormatDiagnosticsHost = {
			getCanonicalFileName: (path) => path,
			getCurrentDirectory: () => '/',
			getNewLine: () => '\n',
		};

		const scriptKinds: Record<string, ts.ScriptKind> = {
			'.tsx': ts.ScriptKind.TSX,
			'.mts': ts.ScriptKind.TS,
			'.cts': ts.ScriptKind.TS,
			'.ts': ts.ScriptKind.TS,

			'.jsx': ts.ScriptKind.JSX,
			'.mjs': ts.ScriptKind.JS,
			'.cjs': ts.ScriptKind.JS,
			'.js': ts.ScriptKind.JS,
		};

		for (const path of walkTree(tree, {
			include: ['**/*.{m,c,}{t,j}s', '**/*.{m,c,}{t,j}sx'],
		})) {
			let content = tree.readText(path);
			let sourceFile = ts.createSourceFile(
				path,
				content,
				ts.ScriptTarget.ESNext,
				false,
				scriptKinds[extname(path)],
			);

			if (visitors.length) {
				for (const visitor of visitors) {
					const recorder = tree.beginUpdate(path);

					visitor(
						sourceFile,
						createTypescriptUpdateRecorder(sourceFile, recorder),
					);

					tree.commitUpdate(recorder);

					const newContent = tree.readText(path);
					sourceFile = ts.updateSourceFile(
						sourceFile,
						newContent,
						ts.createTextChangeRange(
							ts.createTextSpan(0, content.length),
							newContent.length,
						),
					);
					content = newContent;
				}
			}

			if (transforms.length) {
				const result = ts.transform(sourceFile, transforms);

				if (result.diagnostics) {
					for (const diagnostic of result.diagnostics) {
						switch (diagnostic.category) {
							case ts.DiagnosticCategory.Error:
								context.logger.error(
									ts.formatDiagnostic(diagnostic, formatDiagnosticsHost),
								);
								break;
							case ts.DiagnosticCategory.Warning:
								context.logger.warn(
									ts.formatDiagnostic(diagnostic, formatDiagnosticsHost),
								);
								break;
							default:
								context.logger.info(
									ts.formatDiagnostic(diagnostic, formatDiagnosticsHost),
								);
								break;
						}
					}
				}

				const transformedSourceFile = result.transformed[0]!;

				if (transformedSourceFile !== sourceFile) {
					tree.overwrite(path, printer.printFile(transformedSourceFile));
				}
			}
		}
	};
}

function createTypeCheckedRunner(journey: Journey) {
	let currentProgram: ts.Program | undefined = undefined;
	let currentTypeChecker: ts.TypeChecker | undefined = undefined;

	function assertProgram(): ts.Program {
		if (currentProgram == null) {
			throw new Error(
				"The journey's Program can only be used within the transform functions",
			);
		}

		return currentProgram;
	}
	const program = new Proxy({} as ts.Program, {
		defineProperty() {
			throw new Error("Don't modify the journey Program");
		},
		deleteProperty() {
			throw new Error("Don't modify the journey Program");
		},
		set() {
			throw new Error("Don't modify the journey Program");
		},
		setPrototypeOf() {
			throw new Error("Don't modify the journey Program");
		},
		preventExtensions() {
			throw new Error("Don't modify the journey Program");
		},

		get(_, prop) {
			return Reflect.get(assertProgram(), prop);
		},
		has(_, prop) {
			return Reflect.has(assertProgram(), prop);
		},
	});

	function assertTypeChecker(): ts.TypeChecker {
		if (currentTypeChecker == null) {
			throw new Error(
				"The journey's TypeChecker can only be used within the transform functions",
			);
		}

		return currentTypeChecker;
	}
	const typeChecker = new Proxy({} as ts.TypeChecker, {
		defineProperty() {
			throw new Error("Don't modify the journey TypeChecker");
		},
		deleteProperty() {
			throw new Error("Don't modify the journey TypeChecker");
		},
		set() {
			throw new Error("Don't modify the journey TypeChecker");
		},
		setPrototypeOf() {
			throw new Error("Don't modify the journey TypeChecker");
		},
		preventExtensions() {
			throw new Error("Don't modify the journey TypeChecker");
		},

		get(_, prop) {
			return Reflect.get(assertTypeChecker(), prop);
		},
		has(_, prop) {
			return Reflect.has(assertTypeChecker(), prop);
		},
	});

	const runner = async (
		visitors: ((
			sourceFile: ts.SourceFile,
			recorder: TypescriptUpdateRecorder,
		) => void)[],
		transforms: ts.TransformerFactory<ts.SourceFile>[],
	) => {
		const tree = getTree(journey);
		const context = getContext(journey);
		const printer = ts.createPrinter();

		const tsConfigs = new Set<string>();
		if (tree.exists('tsconfig.json')) {
			tsConfigs.add('tsconfig.json');
		}
		if (tree.exists('jsconfig.json')) {
			tsConfigs.add('jsconfig.json');
		}

		const workspace = await getWorkspace(tree);
		for (const project of workspace.projects.values()) {
			if (tree.exists(join(project.root, 'tsconfig.json'))) {
				tsConfigs.add(join(project.root, 'tsconfig.json'));
			}
			if (tree.exists(join(project.root, 'jsconfig.json'))) {
				tsConfigs.add(join(project.root, 'jsconfig.json'));
			}

			for (const target of project.targets.values()) {
				const tsConfig = target.options?.tsconfig ?? target.options?.tsConfig;

				if (typeof tsConfig === 'string' && tree.exists(tsConfig)) {
					tsConfigs.add(tsConfig);
				}
			}
		}

		const handledFiles = new Set<string>();

		const sys = createSystem({logger: context.logger, tree});
		try {
			for (const tsConfig of tsConfigs) {
				currentProgram = await createProgram({
					logger: context.logger,
					tree,
					project: tsConfig,
					sys,
				});
				currentTypeChecker = currentProgram.getTypeChecker();

				for (let sourceFile of currentProgram.getSourceFiles()) {
					if (currentProgram.isSourceFileFromExternalLibrary(sourceFile)) {
						continue;
					}

					const path = getPath(sourceFile);
					if (handledFiles.has(path)) {
						continue;
					}
					handledFiles.add(path);

					if (visitors.length) {
						let content = sourceFile.text;

						for (const visitor of visitors) {
							const recorder = tree.beginUpdate(path);

							visitor(
								sourceFile,
								createTypescriptUpdateRecorder(sourceFile, recorder),
							);

							tree.commitUpdate(recorder);

							const newContent = tree.readText(path);
							sourceFile = ts.updateSourceFile(
								sourceFile,
								newContent,
								ts.createTextChangeRange(
									ts.createTextSpan(0, content.length),
									newContent.length,
								),
							);
							content = newContent;
						}
					}

					if (transforms.length) {
						const result = ts.transform(sourceFile, transforms);

						if (result.diagnostics) {
							for (const diagnostic of result.diagnostics) {
								switch (diagnostic.category) {
									case ts.DiagnosticCategory.Error:
										context.logger.error(
											ts.formatDiagnostic(diagnostic, formatDiagnosticsHost),
										);
										break;
									case ts.DiagnosticCategory.Warning:
										context.logger.warn(
											ts.formatDiagnostic(diagnostic, formatDiagnosticsHost),
										);
										break;
									default:
										context.logger.info(
											ts.formatDiagnostic(diagnostic, formatDiagnosticsHost),
										);
										break;
								}
							}
						}

						const transformedSourceFile = result.transformed[0]!;

						if (transformedSourceFile !== sourceFile) {
							tree.overwrite(path, printer.printFile(transformedSourceFile));
						}
					}
				}
			}
		} finally {
			currentProgram = undefined;
			currentTypeChecker = undefined;
		}
	};

	return {
		runner,
		program,
		typeChecker,
	};
}
