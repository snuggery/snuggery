import type {schema} from '@angular-devkit/core';
import {isJsonObject, JsonObject} from '@snuggery/core';
import {
	ColorFormat,
	Command,
	ErrorWithMeta,
	Option as CommandOption,
	UsageError,
} from 'clipanion';
import getPackageManager from 'which-pm-runs';

import {Cached} from '../utils/decorator';
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

	protected async createSchemaRegistry(
		formats?: import('@angular-devkit/core').schema.SchemaFormat[],
	): Promise<import('@angular-devkit/core').schema.CoreSchemaRegistry> {
		const {schema} = await import('@angular-devkit/core');

		const registry = new schema.CoreSchemaRegistry(formats);
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

		return getPackageManager()?.name;
	}

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

	/**
	 * Override of the `catch` hook to prettify errors before they're printed by clipanion
	 *
	 * @param e the caught error
	 * @override
	 */
	override async catch(e: unknown): Promise<void> {
		return super.catch(e instanceof Error ? await this.prettifyError(e) : e);
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
