import {
	type BuilderContext,
	BuildFailureError,
	getProjectPath,
	resolveProjectPath,
	resolveWorkspacePath,
} from '@snuggery/architect';
import fs from 'node:fs/promises';
import ts from 'typescript';

import type {WrappedPlugin} from './plugin';
import type {Schema} from './schema';

export async function tsc(
	context: BuilderContext,
	input: Pick<Schema, 'tsconfig' | 'compile'>,
	outputFolder: string,
	plugins: readonly WrappedPlugin[],
): Promise<void> {
	if (input.compile === false) {
		context.logger.debug('Typescript compilation was disabled explicitly');
		return;
	}

	const tsconfigPath = await getTsConfigPath(context, input);

	if (tsconfigPath == null) {
		if (input.compile) {
			throw new BuildFailureError(
				"Couldn't find tsconfig but compile is set to true",
			);
		}

		context.logger.info(
			'No typescript configuration found, skipping compilation',
		);
		return;
	}

	context.logger.debug('Compiling typescript...');

	const tsconfig = ts.readConfigFile(tsconfigPath, path =>
		ts.sys.readFile(path),
	);
	const customTransformers = plugins
		.map(plugin => plugin.typescriptTransformers)
		.reduce(combineCustomTransformers, {});

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
		if (parsedConfig.options.outDir !== outputFolder) {
			throw new BuildFailureError(
				`Expected outDir in ${tsconfigPath} to point towards ${outputFolder}`,
			);
		}

		const formatDiagnosticsHost = getFormatDiagnosticsHost(
			context,
			parsedConfig.options,
		);
		const host = ts.createSolutionBuilderHost(ts.sys, undefined, diagnostic => {
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
		});

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
			throw new BuildFailureError('Compilation failed');
		}
	} else {
		parsedConfig.options.outDir = outputFolder;

		const host = (
			parsedConfig.options.incremental
				? ts.createIncrementalCompilerHost
				: ts.createCompilerHost
		)(parsedConfig.options);

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

		return processResult(context, parsedConfig.options, diagnostics);
	}
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
	{tsconfig}: Pick<Schema, 'tsconfig'>,
) {
	if (tsconfig) {
		return resolveWorkspacePath(ctx, tsconfig);
	}

	const resolvedTsconfig = await resolveProjectPath(ctx, 'tsconfig.json');

	try {
		await fs.stat(resolvedTsconfig);
		return resolvedTsconfig;
	} catch {
		return null;
	}
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
			.map(errorOrWarning =>
				ts.formatDiagnostic(errorOrWarning, formatDiagnosticsHost),
			)
			.join('\n'),
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
		getCanonicalFileName: fileName => fileName.replace(/\\/g, '/'),
		getNewLine: () => {
			// Manually determine the proper new line string based on the passed compiler
			// options. There is no public TypeScript function that returns the corresponding
			// new line string. see: https://github.com/Microsoft/TypeScript/issues/29581
			if (options && options.newLine !== undefined) {
				return options.newLine === ts.NewLineKind.LineFeed ? '\n' : '\r\n';
			}
			return ts.sys.newLine;
		},
	};
}
