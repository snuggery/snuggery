import {
	type BuilderContext,
	BuildFailureError,
	getProjectPath,
	resolveProjectPath,
	resolveWorkspacePath,
} from "@snuggery/architect";
import fs from "node:fs/promises";
import ts from "typescript";

import type {Schema} from "./schema.js";

export interface TscInput {
	/**
	 * Path to a `tsconfig.json` or `jsconfig.json`
	 *
	 * Defaults to `<project path>/tsconfig.json` if it exists
	 */
	tsconfig?: string;

	/**
	 * Whether to enable typescript compilation
	 *
	 * This defaults to `true` if a tsconfig is present, otherwise it defaults to
	 * false.
	 */
	compile?: boolean;

	/**
	 * Folder to output compiled files
	 *
	 * If the tsconfig points towards a composite project, this folder must match
	 * with the output folder configured in the tsconfig file.
	 */
	outputFolder: string;

	/**
	 * Custom transformer(s) to run the program through
	 */
	transformers?: ts.CustomTransformers | readonly ts.CustomTransformers[];

	/**
	 * Function that validates the tsconfig file
	 *
	 * This can be used to e.g. check whether `declarations: true` is set if your
	 * builder expects types to be built.
	 */
	validateConfiguration?: (
		compilerOptions: ts.CompilerOptions,
	) => void | Promise<void>;
}

export interface TscDisabledOutput {
	built: false;
}

export interface TscEnabledOutput {
	built: true;

	/**
	 * The typescript project that was just built
	 */
	project: ts.ParsedCommandLine;
}

export type TscOutput = TscDisabledOutput | TscEnabledOutput;

export async function tsc(
	context: BuilderContext,
	input: TscInput & {compile: false},
): Promise<TscDisabledOutput>;
export async function tsc(
	context: BuilderContext,
	input: TscInput & {compile: true},
): Promise<TscEnabledOutput>;
export async function tsc(
	context: BuilderContext,
	input: TscInput,
): Promise<TscOutput>;
export async function tsc(
	context: BuilderContext,
	input: TscInput,
): Promise<TscOutput> {
	if (input.compile === false) {
		context.logger.debug("Typescript compilation was disabled explicitly");
		return {built: false};
	}

	const tsconfigPath = await getTsConfigPath(context, input);

	if (tsconfigPath == null) {
		if (input.compile) {
			throw new BuildFailureError(
				"Couldn't find tsconfig but compile is set to true",
			);
		}

		context.logger.info(
			"No typescript configuration found, skipping compilation",
		);
		return {built: false};
	}

	context.logger.debug("Compiling typescript...");

	const tsconfig = ts.readConfigFile(tsconfigPath, (path) =>
		ts.sys.readFile(path),
	);
	const customTransformers = (
		input.transformers ? [input.transformers].flat() : []
	).reduce(combineCustomTransformers, {});

	if (tsconfig.error) {
		processResult(context, undefined, [tsconfig.error]);
	}

	const parsedConfig = ts.parseJsonConfigFileContent(
		tsconfig.config,
		ts.sys,
		await getProjectPath(context),
	);

	// When in a composite project, we'll use the typescript API to trigger the
	// equivalent of `tsc --build`. This API doesn't accept a tsconfig object,
	// so we can only validate that the config is correct (outDir should point
	// to the output folder).
	// For non-composite projects we can set the outDir ourselves on the config
	// object that we pass into typescript's non-build API.

	if (parsedConfig.options.composite) {
		if (input.outputFolder !== parsedConfig.options.outDir) {
			throw new BuildFailureError(
				`Expected outDir in ${tsconfigPath} to point towards ${input.outputFolder}`,
			);
		}

		const formatDiagnosticsHost = getFormatDiagnosticsHost(
			context,
			parsedConfig.options,
		);
		const host = ts.createSolutionBuilderHost(
			ts.sys,
			undefined,
			(diagnostic) => {
				const message = ts.formatDiagnostic(diagnostic, formatDiagnosticsHost);

				switch (diagnostic.category) {
					case ts.DiagnosticCategory.Error:
						context.logger.error(message);
						break;
					case ts.DiagnosticCategory.Warning:
						context.logger.warn(message);
						break;
					default:
						context.logger.info(message);
				}
			},
		);

		if ("JSDocParsingMode" in ts) {
			host.jsDocParsingMode = ts.JSDocParsingMode.ParseForTypeErrors;
		}

		const builder = ts.createSolutionBuilder(host, [tsconfigPath], {
			incremental: parsedConfig.options.incremental,
		});

		if (
			builder.build(
				tsconfigPath,
				undefined,
				undefined,
				() => customTransformers,
			) !== ts.ExitStatus.Success
		) {
			throw new BuildFailureError("Compilation failed");
		}
	} else {
		parsedConfig.options.outDir = input.outputFolder;

		const host = (
			parsedConfig.options.incremental
				? ts.createIncrementalCompilerHost
				: ts.createCompilerHost
		)(parsedConfig.options);

		if ("JSDocParsingMode" in ts) {
			host.jsDocParsingMode = ts.JSDocParsingMode.ParseForTypeErrors;
		}

		const program = (
			parsedConfig.options.incremental
				? ts.createEmitAndSemanticDiagnosticsBuilderProgram
				: ts.createAbstractBuilder
		)(
			parsedConfig.fileNames,
			parsedConfig.options,
			host,
			undefined,
			parsedConfig.errors,
			parsedConfig.projectReferences,
		);

		const {diagnostics} = program.emit(
			undefined,
			undefined,
			undefined,
			undefined,
			customTransformers,
		);

		processResult(context, parsedConfig.options, diagnostics);
	}

	return {built: true, project: parsedConfig};
}

function combineCustomTransformers(
	a: ts.CustomTransformers,
	b: ts.CustomTransformers,
): ts.CustomTransformers {
	return {
		before: (a.before || b.before) && [
			...(a.before || []),
			...(b.before || []),
		],
		after: (a.after || b.after) && [...(a.after || []), ...(b.after || [])],
		afterDeclarations: (a.afterDeclarations || b.afterDeclarations) && [
			...(a.afterDeclarations || []),
			...(b.afterDeclarations || []),
		],
	};
}

async function getTsConfigPath(
	ctx: BuilderContext,
	{tsconfig}: Pick<Schema, "tsconfig">,
) {
	if (tsconfig) {
		return resolveWorkspacePath(ctx, tsconfig);
	}

	for (const filename of ["tsconfig.lib.json", "tsconfig.json"]) {
		const resolvedTsconfig = await resolveProjectPath(ctx, filename);

		try {
			if ((await fs.stat(resolvedTsconfig)).isFile()) {
				return resolvedTsconfig;
			}
		} catch {
			// ignore
		}
	}

	return null;
}

function processResult(
	context: BuilderContext,
	options: ts.CompilerOptions | undefined,
	allDiagnostics: readonly ts.Diagnostic[],
): void {
	const errorsAndWarnings = allDiagnostics.filter(function (d) {
		return d.category !== ts.DiagnosticCategory.Message;
	});

	if (errorsAndWarnings.length === 0) {
		return;
	}
	const formatDiagnosticsHost = getFormatDiagnosticsHost(context, options);

	throw new BuildFailureError(
		errorsAndWarnings
			.map((errorOrWarning) =>
				ts.formatDiagnostic(errorOrWarning, formatDiagnosticsHost),
			)
			.join("\n"),
	);
}

function getFormatDiagnosticsHost(
	context: BuilderContext,
	options?: ts.CompilerOptions,
): ts.FormatDiagnosticsHost {
	return {
		getCurrentDirectory: () => context.workspaceRoot,
		// We need to normalize the path separators here because by default, TypeScript
		// compiler hosts use posix canonical paths. In order to print consistent diagnostics,
		// we also normalize the paths.
		getCanonicalFileName: (fileName) => fileName.replace(/\\/g, "/"),
		getNewLine: () => {
			// Manually determine the proper new line string based on the passed compiler
			// options. There is no public TypeScript function that returns the corresponding
			// new line string. see: https://github.com/Microsoft/TypeScript/issues/29581
			if (options && options.newLine !== undefined) {
				return options.newLine === ts.NewLineKind.LineFeed ? "\n" : "\r\n";
			}
			return ts.sys.newLine;
		},
	};
}
