import {
	type SchematicContext,
	SchematicsException,
	type Tree,
} from '@angular-devkit/schematics';
import {filterByPatterns} from '@snuggery/core';
import {posix} from 'path';
import ts from 'typescript';

import {getWorkspace} from './workspace';

export {ts};

export interface CreateProgramOptions {
	/**
	 * Path to the typescript project, similar to tsc's `--project` option
	 *
	 * Either a folder or a `jsconfig.json`/`tsconfig.json` file
	 */
	project?: string;

	/**
	 * Name of the workspace project to run the schematic in
	 *
	 * If present, the root folder of the project is the default project location.
	 * If absent, the default project location is the workspace root.
	 */
	workspaceProjectName?: string;

	/**
	 * Host tree of the schematic
	 */
	tree: Tree;

	/**
	 * Logger
	 */
	logger: SchematicContext['logger'];

	/**
	 * TypeScript System created via `createSystem`
	 */
	sys?: ts.System;
}

/**
 * Location where the virtual file system is mapped in the typescript `System`.
 */
export const virtualFileSystemFolder = '/__workspace__';

/**
 * Return the path of the given source file
 */
export function getPath(sourceFile: ts.SourceFile): string;
export function getPath({fileName}: ts.SourceFile): string {
	if (fileName.startsWith(virtualFileSystemFolder)) {
		return fileName.slice(virtualFileSystemFolder.length + 1);
	} else {
		return fileName;
	}
}

/**
 * Create a typescript `System` that contains a root folder called `__workspace__` which contains the given Tree.
 *
 * The working directory is set to the workspace root.
 *
 * @param tree The virtual file system to map onto `/__workspace__`
 * @returns A typescript `System` that maps `/__workspace__` on the virtual file system.
 */
export function createSystem({
	logger,
	tree,
}: Pick<CreateProgramOptions, 'logger' | 'tree'>): ts.System {
	/* eslint-disable @typescript-eslint/no-explicit-any */
	type SystemMethod = {
		[key in keyof ts.System]-?: ts.System[key] extends (
			path: string,
			...args: any[]
		) => any
			? key
			: never;
	}[keyof ts.System];

	function proxy<K extends SystemMethod>(
		name: K,
		impl: ts.System[K],
	): ts.System[K];
	function proxy(
		name: SystemMethod,
		impl: (path: string, ...args: any[]) => any,
	): (path: string, ...args: any[]) => any {
		return (path: string, ...args: any[]): any => {
			if (path.startsWith(virtualFileSystemFolder)) {
				return impl(path.slice(virtualFileSystemFolder.length), ...args);
			} else {
				// @ts-expect-error Typescript can't tell we can pass ...args into the function
				return ts.sys[name](path, ...args);
			}
		};
	}
	/* eslint-enable @typescript-eslint/no-explicit-any */

	return {
		args: [],
		createDirectory: proxy('createDirectory', () => {
			// there is no "mkdir" function in Tree
		}),
		directoryExists: proxy('directoryExists', (path) => {
			if (tree.exists(path)) {
				// is a file
				return false;
			}

			const dir = tree.getDir(path);
			return dir.subdirs.length > 0 || dir.subfiles.length > 0;
		}),
		exit(exitCode) {
			ts.sys.exit(exitCode);
		},
		fileExists: proxy('fileExists', (path) => {
			return tree.exists(path);
		}),
		getCurrentDirectory: () => virtualFileSystemFolder,
		getDirectories: proxy('getDirectories', (path) => {
			return tree.getDir(path).subdirs;
		}),
		getExecutingFilePath() {
			return ts.sys.getExecutingFilePath();
		},
		newLine: '\n',
		readDirectory: proxy(
			'readDirectory',
			(path, extensions, exclude, include, depth) => {
				let files: string[] = [];

				function collect(path: string, d: number) {
					if (depth != null && d > depth) {
						return;
					}

					const dir = tree.getDir(path);

					for (const file of dir.subfiles) {
						files.push(posix.join(path, file));
					}

					for (const subDir of dir.subdirs) {
						collect(posix.join(path, subDir), d + 1);
					}
				}

				collect(path, 0);

				if (extensions != null) {
					const exts = new Set(extensions);

					files = files.filter((file) => exts.has(posix.extname(file)));
				}

				if (include != null || exclude != null) {
					files = filterByPatterns(files, {
						include: include ?? '**/*',
						exclude,
					});
				}

				return files.map((file) => posix.join(virtualFileSystemFolder, file));
			},
		),
		readFile: proxy('readFile', (path, encoding = 'utf-8') => {
			return tree.read(path)?.toString(encoding as BufferEncoding);
		}),
		resolvePath(path) {
			return ts.sys.resolvePath(path);
		},
		useCaseSensitiveFileNames: ts.sys.useCaseSensitiveFileNames,
		write: (string) => logger.debug(string),
		writeFile: proxy('writeFile', (path, data) => {
			if (tree.exists(path)) {
				tree.overwrite(path, data);
			} else {
				tree.create(path, data);
			}
		}),
	};
}

export const formatDiagnosticsHost: ts.FormatDiagnosticsHost = {
	getCanonicalFileName: (path) => posix.normalize(path),
	getCurrentDirectory: () => virtualFileSystemFolder,
	getNewLine: () => '\n',
};

/**
 * Read typescript configuration for the given project
 */
export async function readProjectConfiguration({
	project,
	workspaceProjectName,
	logger,
	tree,
	sys = createSystem({logger, tree}),
}: CreateProgramOptions): Promise<ts.ParsedCommandLine> {
	if (project == null) {
		if (workspaceProjectName == null) {
			project = '/';
		} else {
			const workspace = await getWorkspace(tree);
			const workspaceProject = workspace.projects.get(workspaceProjectName);

			if (workspaceProject == null) {
				throw new SchematicsException(
					`Can't find project ${JSON.stringify(
						workspaceProjectName,
					)} in the workspace`,
				);
			}

			project = workspaceProject.root;
		}
	}

	if (tree.exists(posix.join(project, 'tsconfig.json'))) {
		project = posix.join(project, 'tsconfig.json');
	} else if (tree.exists(posix.join(project, 'jsconfig.json'))) {
		project = posix.join(project, 'jsconfig.json');
	}

	if (tree.exists(project)) {
		const {config, error} = ts.readConfigFile(
			posix.join(virtualFileSystemFolder, project),
			sys.readFile,
		);

		if (error) {
			logger.error(ts.formatDiagnostic(error, formatDiagnosticsHost));
			throw new SchematicsException(
				`Failed to read typescript configuration file ${project}`,
			);
		}

		const result = ts.parseJsonConfigFileContent(
			config,
			sys,
			posix.dirname(posix.join(virtualFileSystemFolder, project)),
			undefined,
			project,
		);
		result.options.noEmit = true;

		return result;
	} else {
		return ts.parseJsonConfigFileContent(
			{
				compilerOptions: {
					allowJs: true,
					noEmit: true,
					skipLibCheck: true,
					target: 'esnext',
					module: 'esnext',
					moduleResolution: 'node',
				},
			},
			sys,
			posix.join(virtualFileSystemFolder, project),
		);
	}
}

/**
 * Create a typescript program within the virtual file system of the schematic
 *
 * @param validate If true, throw an error if the program has errors
 */
export async function createProgram(
	options: CreateProgramOptions,
	validate = false,
): Promise<ts.Program> {
	const sys = options.sys ?? createSystem(options);
	const configuration = await readProjectConfiguration({...options, sys});

	const compilerHost = ts.createCompilerHost(configuration.options, true);
	compilerHost.directoryExists = sys.directoryExists;
	compilerHost.fileExists = sys.fileExists;
	compilerHost.getCurrentDirectory = sys.getCurrentDirectory;
	compilerHost.getDirectories = sys.getDirectories;
	compilerHost.getNewLine = () => sys.newLine;
	compilerHost.readDirectory = sys.readDirectory;
	compilerHost.readFile = sys.readFile;
	compilerHost.realpath = sys.realpath;

	const program = ts.createProgram({
		options: configuration.options,
		rootNames: configuration.fileNames,
		configFileParsingDiagnostics: configuration.errors,
		host: compilerHost,
		projectReferences: configuration.projectReferences,
	});

	if (validate) {
		let hasError = false;

		for (const diagnostic of [
			...program.getGlobalDiagnostics(),
			...program.getOptionsDiagnostics(),
			...program.getSemanticDiagnostics(),
			...program.getSyntacticDiagnostics(),
			...program.getDeclarationDiagnostics(),
			...program.getConfigFileParsingDiagnostics(),
		]) {
			switch (diagnostic.category) {
				case ts.DiagnosticCategory.Error:
					hasError = true;
					options.logger.error(
						ts.formatDiagnostic(diagnostic, formatDiagnosticsHost),
					);
					break;
				case ts.DiagnosticCategory.Warning:
					options.logger.warn(
						ts.formatDiagnostic(diagnostic, formatDiagnosticsHost),
					);
					break;
				default:
					options.logger.info(
						ts.formatDiagnostic(diagnostic, formatDiagnosticsHost),
					);
					break;
			}
		}

		if (hasError) {
			throw new SchematicsException('Fix compilation errors before continuing');
		}
	}

	return program;
}
