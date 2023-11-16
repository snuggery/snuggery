import {type BuilderContext, BuildFailureError} from '@snuggery/architect';
import type {JsonObject} from '@snuggery/core';
import type {
	CustomTransformerFactory,
	CustomTransformers,
	TransformerFactory,
} from 'typescript';

import type {Schema} from './schema';

/**
 * A plugin for the `@snuggery/build-node` library compiler
 *
 * Plugins can provide several extension points, all of which are optional.
 * The timing in which these extension points are called or used is not defined, except for the `finalize` hook which is guaranteed to be called once at the end of the compilation.
 */
export interface Plugin {
	/**
	 * `CustomTransformers` to be passed to the typescript compiler
	 *
	 * The `typescriptTransformers` of all plugins are combined in the order the plugins are configured in.
	 */
	typescriptTransformers?: CustomTransformers;

	/**
	 * Function called with the manifest
	 *
	 * This function is called once for every `package.json` that is written in the output folder.
	 * The manifest will already be filled in by the compiler, with `scripts` and `devDependencies` removed if so configured.
	 */
	processManifest?(manifest: JsonObject): void;

	/**
	 * Function called when the compilation is complete
	 *
	 * This function is called exactly once when the compilation is complete.
	 * Use this for clean-up or to e.g. perform validations on information collected in the other hooks.
	 */
	finalize?(): void;
}

/**
 * Factory of plugin instances
 *
 * A plugin is loaded via its factory, which is passed into the compiler.
 */
export interface PluginFactory<I = unknown> {
	/**
	 * The name of the plugin
	 *
	 * This name is added to logged errors to help identify the cause
	 */
	readonly name: string;
	/**
	 * Function called to create the plugin instance
	 */
	create(builderInput: Schema, pluginInput?: I): Plugin;
}

export interface WrappedPlugin {
	typescriptTransformers: CustomTransformers;
	processManifest(manifest: JsonObject): void;
	finalize(): void;
}

export function createPlugin<T = unknown>(
	context: BuilderContext,
	factory: PluginFactory<T>,
	...input: Parameters<PluginFactory<T>['create']>
): WrappedPlugin {
	const plugin = wrap(factory.create, factory)(...input);
	const finalize = plugin.finalize ? wrap(plugin.finalize, plugin) : noop;

	const typescriptTransformers: CustomTransformers =
		plugin.typescriptTransformers
			? {
					before: plugin.typescriptTransformers.before?.map(
						wrapTransformerFactory,
					),
					after: plugin.typescriptTransformers.after?.map(
						wrapTransformerFactory,
					),
					afterDeclarations:
						plugin.typescriptTransformers.afterDeclarations?.map(
							wrapTransformerFactory,
						),
			  }
			: {};

	const processManifest = plugin.processManifest
		? wrap(plugin.processManifest, plugin)
		: noop;

	return {finalize, typescriptTransformers, processManifest};

	function wrap<A extends unknown[], R, T>(
		fn: (this: T, ...args: A) => R,
		thisArg: T,
	): (...args: A) => R {
		return (...args) => {
			try {
				return fn.apply(thisArg, args);
			} catch (e) {
				context.logger.error(`An error was thrown in plugin ${factory.name}:`);
				if (e instanceof Error) {
					context.logger.error(e.message ?? e.stack);
				} else {
					context.logger.error(String(e));
				}

				throw new BuildFailureError(
					`Unexpected error in plugin ${factory.name}`,
				);
			}
		};
	}

	function wrapTransformerFactory<
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		F extends TransformerFactory<any> | CustomTransformerFactory,
	>(fn: F): F {
		// @ts-expect-error Typescript doesn't seem to like passing in union types to wrap
		const wrappedFn: F = wrap(fn, undefined);

		return (context => {
			const result = wrappedFn(context);

			if (typeof result === 'function') {
				return wrap(result, undefined);
			}

			return {
				transformBundle: wrap(result.transformBundle, result),
				transformSourceFile: wrap(result.transformSourceFile, result),
			};
		}) as F;
	}

	function noop() {
		/* noop */
	}
}
