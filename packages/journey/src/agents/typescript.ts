import type {SchematicContext, Tree} from '@angular-devkit/schematics';
import {getWorkspace, walkTree} from '@snuggery/schematics';
import type {ts} from '@snuggery/schematics/typescript';
import {extname, join} from 'node:path/posix';

import type {Journey, TravelAgent, TypescriptTransformFactory} from '../types';

type TypescriptJourney = Journey['typescript'];

export class TypescriptTravelAgent implements TravelAgent, TypescriptJourney {
	#configuring = true;
	#transforms = new Map<TypescriptTransformFactory<unknown>, unknown[]>();
	#program: {program: ts.Program; typeChecker: ts.TypeChecker} | undefined;

	#runner: (
		transforms: ts.TransformerFactory<ts.SourceFile>[],
	) => void | Promise<void>;

	#tree: Tree;
	#context: SchematicContext;

	constructor(tree: Tree, context: SchematicContext) {
		this.#tree = tree;
		this.#context = context;

		this.#runner = createSimpleRunner(tree, context);
	}

	#assertIsConfiguring(operation: string & keyof this) {
		if (!this.#configuring) {
			throw new Error(`${operation} must be called during Trip#configure`);
		}
	}

	addTransform(transform: ts.TransformerFactory<ts.SourceFile>): void {
		this.#assertIsConfiguring('addTransform');
		this.#transforms.set(() => transform, []);
	}

	addDeduplicatedTransform<T>(
		transform: TypescriptTransformFactory<T>,
		input: T,
	): void;
	addDeduplicatedTransform(
		transform: TypescriptTransformFactory<unknown>,
		input: unknown,
	): void {
		this.#assertIsConfiguring('addDeduplicatedTransform');

		let inputs = this.#transforms.get(transform);
		if (inputs == null) {
			inputs = [];
			this.#transforms.set(transform, inputs);
		}

		inputs.push(input);
	}

	typeCheck(): {program: ts.Program; typeChecker: ts.TypeChecker} {
		this.#assertIsConfiguring('addTransform');

		if (this.#program == null) {
			({runner: this.#runner, ...this.#program} = createTypeCheckedRunner(
				this.#tree,
				this.#context,
			));
		}

		return this.#program!;
	}

	async bookTrips(): Promise<void> {
		this.#configuring = false;

		await this.#runner(
			Array.from(this.#transforms, ([transformFactory, input]) =>
				transformFactory({input, context: this.#context}),
			),
		);
	}
}

function createSimpleRunner(tree: Tree, context: SchematicContext) {
	return (transforms: ts.TransformerFactory<ts.SourceFile>[]) => {
		const {ts} =
			require('@snuggery/schematics/typescript') as typeof import('@snuggery/schematics/typescript');
		const printer = ts.createPrinter();

		const formatDiagnosticsHost: ts.FormatDiagnosticsHost = {
			getCanonicalFileName: path => path,
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
			const sourceFile = ts.createSourceFile(
				path,
				tree.readText(path),
				ts.ScriptTarget.ESNext,
				false,
				scriptKinds[extname(path)],
			);

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

			if (transformedSourceFile === sourceFile) {
				// nothing happened
				return;
			}

			tree.overwrite(path, printer.printFile(transformedSourceFile));
		}
	};
}

function createTypeCheckedRunner(tree: Tree, context: SchematicContext) {
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

	const runner = async (transforms: ts.TransformerFactory<ts.SourceFile>[]) => {
		const {ts, createSystem, createProgram, getPath, formatDiagnosticsHost} =
			require('@snuggery/schematics/typescript') as typeof import('@snuggery/schematics/typescript');
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

				for (const sourceFile of currentProgram.getSourceFiles()) {
					if (sourceFile.fileName.includes('/node_modules/')) {
						continue;
					}

					const path = getPath(sourceFile);
					if (handledFiles.has(path)) {
						continue;
					}
					handledFiles.add(path);

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

					if (transformedSourceFile === sourceFile) {
						// nothing happened
						return;
					}

					tree.overwrite(path, printer.printFile(transformedSourceFile));
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
