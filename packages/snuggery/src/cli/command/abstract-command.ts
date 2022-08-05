import type {Architect} from '@angular-devkit/architect';
import type {schema} from '@angular-devkit/core';
import {isJsonObject, JsonObject} from '@snuggery/core';
import {
	ColorFormat,
	Command,
	ErrorWithMeta,
	Option as CommandOption,
	UsageError,
} from 'clipanion';
import path, {dirname, normalize, posix, relative} from 'path';

import type {SnuggeryArchitectHost} from '../architect/index';
import {Cached} from '../utils/decorator';
import {memoize} from '../utils/memoize';
import {
	ParsedArguments,
	parseFreeFormArguments,
	parseOptions,
} from '../utils/parse-options';
import type {Option} from '../utils/parse-schema';
import type {Report} from '../utils/report';

import type {CliWorkspace, Context} from './context';

/**
 * An error that won't show a stack trace
 */
class PrettiedError extends Error implements ErrorWithMeta {
	readonly clipanion = {type: 'none'} as const;

	constructor(name: string, message: string) {
		super(message);
		this.name = name;
	}
}

/** Errors the Angular APIs throw that shouldn't show a stacktrace */
const angularUserErrors = new Set([
	// Schematics
	'CollectionCannotBeResolvedException',
	'InvalidCollectionJsonException',
	'CollectionMissingSchematicsMapException',
	'CollectionMissingFieldsException',
	'CircularCollectionException',
	'UnknownCollectionException',
	'NodePackageDoesNotSupportSchematics',
	'SchematicMissingFactoryException',
	'FactoryCannotBeResolvedException',
	'CollectionMissingFieldsException',
	'SchematicMissingDescriptionException',
	'SchematicNameCollisionException',
	'UnknownSchematicException',
	'PrivateSchematicException',
	'SchematicMissingFieldsException',
]);

/**
 * Superclass for all commands
 */
export abstract class AbstractCommand extends Command<Context> {
	/**
	 * Turn on extra logging
	 */
	verbose = CommandOption.Boolean('--verbose,-v', false, {
		description: 'Turn on extra logging',
		hidden: true,
	});

	/**
	 * Configuration of the currently active workspace
	 *
	 * @throws if snuggery is run outside of a workspace
	 */
	protected get workspace(): CliWorkspace {
		const {workspace} = this.context;

		if (workspace == null) {
			const err = new UsageError(`Couldn't find any workspace configuration`);
			err.clipanion.type = 'none';
			throw err;
		}

		return workspace;
	}

	/**
	 * The name of the current project, if the is one
	 */
	protected get currentProject(): string | null {
		const {workspace, startCwd} = this.context;

		return (
			workspace?.tryGetProjectNameByCwd(startCwd, message =>
				this.context.report.reportWarning(message),
			) ?? null
		);
	}

	/**
	 * A logger for angular APIs that logs onto the Report of the CLI's context
	 */
	@Cached()
	protected get logger(): Promise<
		import('@angular-devkit/core').logging.Logger
	> {
		return import('@angular-devkit/core').then(({logging}) => {
			const logger = new logging.Logger('');

			const {report} = this.context;
			const method = {
				debug: report.reportDebug,
				info: report.reportInfo,
				warn: report.reportWarning,
				error: report.reportError,
				fatal: report.reportError,
			} as const;

			logger.subscribe(entry => {
				(method[entry.level] ?? method.info).call(report, entry.message);
			});

			return logger;
		});
	}

	protected async createSchemaRegistry({
		formats,
		workspace = this.context.workspace,
		...opts
	}: Parameters<CliWorkspace['createWorkspaceDataVisitor']>[0] & {
		formats?: import('@angular-devkit/core').schema.SchemaFormat[];
		workspace?: CliWorkspace | null;
	} = {}): Promise<import('../utils/schema-registry.js').SchemaRegistry> {
		const [{SchemaRegistry}, {schema}] = await Promise.all([
			import('../utils/schema-registry.js'),
			import('@angular-devkit/core'),
		]);

		const registry = new SchemaRegistry(formats);
		if (workspace != null) {
			registry.addPreTransform(workspace.createWorkspaceDataVisitor(opts));
		}

		registry.addPostTransform(schema.transforms.addUndefinedDefaults);
		registry.useXDeprecatedProvider(msg => this.report.reportWarning(msg));

		return registry;
	}

	/**
	 * The Report of the CLI's context
	 */
	protected get report(): Report {
		return this.context.report;
	}

	/**
	 * Formatting utility
	 */
	protected get format(): ColorFormat {
		return this.cli.format();
	}

	/**
	 * Name of the package manager to use
	 *
	 * This will typically be `yarn`, `npm`, `pnpm` or `cnpm`.
	 */
	protected get packageManager(): string | undefined {
		const cliExtension = this.context.workspace?.extensions?.cli;

		if (
			isJsonObject(cliExtension) &&
			typeof cliExtension.packageManager === 'string'
		) {
			return cliExtension.packageManager;
		}

		return (require('which-pm-runs') as typeof import('which-pm-runs'))()?.name;
	}

	// Basic setup for Architects, can be used in non-architect commands like --doctor or --sync-config-to

	@Cached()
	protected get architectSchemaRegistry() {
		return this.createSchemaRegistry();
	}

	@Cached()
	protected get architectHost(): Promise<SnuggeryArchitectHost> {
		return import('../architect/index.js').then(({createArchitectHost}) =>
			createArchitectHost(this.context, this.context.workspace),
		);
	}

	@Cached()
	get architect(): Promise<Architect> {
		return Promise.all([
			this.architectHost,
			this.architectSchemaRegistry,
			import('@angular-devkit/architect'),
		]).then(([host, registry, {Architect}]) => new Architect(host, registry));
	}

	// Basic setup for Schematics, can be used in non-architect commands like --doctor or --sync-config-to

	/**
	 * JSONSchema registry
	 *
	 * Unlike the registry in the architect family of commands, this registry supports prompting the
	 * user for missing options.
	 */
	@Cached()
	protected get schematicsSchemaRegistry() {
		return import('@angular-devkit/schematics').then(async ({formats}) => {
			const registry = await this.createSchemaRegistry({
				formats: formats.standardFormats,
			});

			registry.addSmartDefaultProvider(
				'projectName',
				() => this.currentProject,
			);
			registry.addSmartDefaultProvider(
				'workingDirectory',
				memoize(() => {
					const {workspace, startCwd} = this.context;

					if (workspace == null) {
						return undefined;
					}

					let relativeCwd = normalize(
						relative(workspace.workspaceFolder, startCwd),
					);

					if (path !== posix) {
						relativeCwd = relativeCwd.replace(/\\/g, '/');
					}

					// Angular maps empty string to undefined, mimic that behavior
					return relativeCwd || undefined;
				}),
			);
			registry.usePromptProvider(
				await (await import('../utils/prompt.js')).createPromptProvider(),
			);

			return registry;
		});
	}

	protected async createEngineHost(
		root: string,
		resolveSelf: boolean,
		optionTransforms?: import('../schematic/engine-host.js').OptionTransform[],
	): Promise<import('../schematic/engine-host.js').SnuggeryEngineHost> {
		const {SnuggeryEngineHost} = await import('../schematic/engine-host.js');
		return new SnuggeryEngineHost(root, {
			context: this.context,
			optionTransforms,
			packageManager: this.packageManager,
			registry: await this.schematicsSchemaRegistry,
			resolvePaths: [
				root,
				...(resolveSelf
					? [dirname(require.resolve('@snuggery/snuggery/package.json'))]
					: []),
			],
			schemaValidation: true,
		});
	}

	protected async createWorkflow(
		engineHost: import('../schematic/engine-host.js').SnuggeryEngineHost,
		root: string,
		force: boolean,
		dryRun: boolean,
	): Promise<import('../schematic/workflow.js').SnuggeryWorkflow> {
		const {SnuggeryWorkflow} = await import('../schematic/workflow.js');
		return new SnuggeryWorkflow(root, {
			engineHost,
			force,
			dryRun,
			registry: await this.schematicsSchemaRegistry,
		});
	}

	// Generic helper functions

	/**
	 * Execute the given function `fn` with the parsed options
	 *
	 * @param options Definitions of the options
	 * @param fn Function to execute with the parsed options
	 */
	protected async withOptionValues<T>(
		options: Parameters<AbstractCommand['parseOptionValues']>[0],
		fn: (parsedOptions: JsonObject) => Promise<T>,
	): Promise<number | T> {
		const [success, parsedOptions] = this.parseOptionValues(options);

		if (!success) {
			return 1;
		} else if (parsedOptions == null) {
			return 0;
		}

		return fn(parsedOptions);
	}

	/**
	 * Parse command options
	 *
	 * @param param Definitions of the options
	 */
	protected parseOptionValues({
		options,
		allowExtraOptions,
		description,
		commandOptions,
		values,
		pathSuffix = [],
		reservedNames,
	}: {
		readonly options: readonly Option[];
		readonly allowExtraOptions: boolean;
		readonly description?: string;
		readonly commandOptions?: readonly Option[];
		readonly values: readonly string[];
		readonly pathSuffix?: readonly string[];
		readonly reservedNames?: ReadonlySet<string>;
	}): ParsedArguments {
		if (options.length === 0) {
			if (allowExtraOptions) {
				return parseFreeFormArguments({
					command: this,
					options: commandOptions,
					path: [...this.path, ...pathSuffix],
					values,
					description,
				});
			} else if (values.length === 0) {
				return [true, {}];
			}
			// else {
			//	 No values are allowed, but values are passed in. We could throw an
			//	 error here but it would be hard to print a useful message.
			//	 However, if we pass the invalid input to `parseOptions` that function
			//	 will print a clear error message.
			// }
		}

		return parseOptions({
			command: this,
			options: commandOptions ? [...options, ...commandOptions] : options,
			path: [...this.path, ...pathSuffix],
			values,
			description,
			reservedNames,
		});
	}

	// Beautify errors

	/**
	 * Override of the `catch` hook to prettify errors before they're printed by clipanion
	 *
	 * @param e the caught error
	 * @override
	 */
	override async catch(e: unknown): Promise<void> {
		return await super.catch(e instanceof Error ? this.prettifyError(e) : e);
	}

	protected prettifyError(error: Error): Error {
		// Extending from the Error class is often done without overriding the name
		// property to something other than 'Error'
		if (error.name === 'Error' && error.constructor !== Error) {
			// Prevent minified code from showing something less useful than 'Error'
			if (error.constructor.name.length > 5) {
				error.name = error.constructor.name;
			}
		}

		if (error.name === 'SchemaValidationException') {
			const errors = (error as schema.SchemaValidationException).errors
				.filter(error => error.message)
				.map(error =>
					error.instancePath
						? `  - Input property ${error.instancePath} ${error.message}`
						: `  - Input ${error.message}`,
				);

			error = new PrettiedError(
				error.name,
				errors.length > 0
					? `Schema validation failed:\n${errors.join('\n')}`
					: error.message,
			);
		}

		if (angularUserErrors.has(error.name)) {
			error = new PrettiedError(error.name, error.message);
		}

		if (/^[A-Z].*[A-Z].*(?:Error|Exception)$/.test(error.name)) {
			// The name of the error is probably already useful
			// e.g. IllegalArgumentException, SchemaValidationException, BuildFailedError
			error.name = error.name.replace(/(?:Error|Exception)$/, '');
		}

		return error;
	}
}
