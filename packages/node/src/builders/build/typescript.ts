import type {BuilderContext, BuilderOutput} from '@angular-devkit/architect';
import {
  getProjectPath,
  resolveProjectPath,
  resolveWorkspacePath,
} from '@snuggery/architect';
import {promises as fs} from 'fs';
import {
  CompilerOptions,
  createProgram,
  Diagnostic,
  DiagnosticCategory,
  formatDiagnostic,
  FormatDiagnosticsHost,
  NewLineKind,
  parseJsonConfigFileContent,
  readConfigFile,
  sys,
} from 'typescript';

import type {Schema} from './schema';

export async function tsc(
  context: BuilderContext,
  input: Pick<Schema, 'tsconfig' | 'compile'>,
  outputFolder: string,
): Promise<BuilderOutput> {
  if (input.compile === false) {
    context.logger.debug('Typescript compilation was disabled explicitly');
    return {success: true};
  }

  const tsconfigPath = await getTsConfigPath(context, input);

  if (tsconfigPath == null) {
    if (input.compile) {
      return {
        success: false,
        error: "Couldn't find tsconfig but compile is set to true",
      };
    }

    context.logger.info(
      'No typescript configuration found, skipping compilation',
    );
    return {success: true};
  }

  context.logger.debug('Compiling typescript...');

  const tsconfig = readConfigFile(tsconfigPath, path => sys.readFile(path));

  if (tsconfig.error) {
    return {
      success: false,
      error: formatDiagnostic(
        tsconfig.error,
        getFormatDiagnosticsHost(tsconfig.config),
      ),
    };
  }

  const parsedConfig = parseJsonConfigFileContent(
    tsconfig.config,
    sys,
    await getProjectPath(context),
  );

  parsedConfig.options.outDir = outputFolder;

  const program = createProgram({
    options: parsedConfig.options,
    rootNames: parsedConfig.fileNames,
    configFileParsingDiagnostics: parsedConfig.errors,
  });

  const diagnostics = program.emit();

  return processResult(diagnostics.diagnostics, parsedConfig.options);
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
  allDiagnostics: readonly Diagnostic[],
  options: CompilerOptions | undefined,
): BuilderOutput {
  const errorsAndWarnings = allDiagnostics.filter(function (d) {
    return d.category !== DiagnosticCategory.Message;
  });

  if (errorsAndWarnings.length === 0) {
    return {success: true};
  }
  const formatDiagnosticsHost = getFormatDiagnosticsHost(options);

  return {
    success: false,
    error: errorsAndWarnings
      .map(errorOrWarning =>
        formatDiagnostic(errorOrWarning, formatDiagnosticsHost),
      )
      .join('\n'),
  };
}

function getFormatDiagnosticsHost(
  options?: CompilerOptions,
): FormatDiagnosticsHost {
  const basePath = options ? options.baseUrl : undefined;
  return {
    getCurrentDirectory: () => basePath || sys.getCurrentDirectory(),
    // We need to normalize the path separators here because by default, TypeScript
    // compiler hosts use posix canonical paths. In order to print consistent diagnostics,
    // we also normalize the paths.
    getCanonicalFileName: fileName => fileName.replace(/\\/g, '/'),
    getNewLine: () => {
      // Manually determine the proper new line string based on the passed compiler
      // options. There is no public TypeScript function that returns the corresponding
      // new line string. see: https://github.com/Microsoft/TypeScript/issues/29581
      if (options && options.newLine !== undefined) {
        return options.newLine === NewLineKind.LineFeed ? '\n' : '\r\n';
      }
      return sys.newLine;
    },
  };
}
