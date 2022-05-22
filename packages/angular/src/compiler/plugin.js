/**
 * @typedef {object} Plugin
 * @property {string} [name]
 * @property {() => void} [finalize]
 * @property {import('./resource-processor.js').StyleProcessor | readonly import('./resource-processor.js').StyleProcessor[]} [styleProcessor]
 * @property {import('typescript').CustomTransformers} [typescriptTransformers]
 * @property {(manifest: import('@snuggery/core').JsonObject) => void} [processManifest]
 */

import {BuildFailureError} from './error.js';

/**
 * `Array.isArray` checks for arrays, we want to check for readonly arrays
 *
 * @param {unknown} value
 * @returns {value is readonly unknown[]}
 */
function isArray(value) {
	return Array.isArray(value);
}

/**
 * @typedef {object} WrappedPlugin
 * @property {() => void} finalize
 * @property {readonly import('./resource-processor.js').StyleProcessor[]} styleProcessor
 * @property {import('typescript').CustomTransformers} typescriptTransformers
 * @property {(manifest: import('@snuggery/core').JsonObject) => void} processManifest
 */

/**
 * @template {unknown[]} T
 * @param {import('./logger.js').Logger} logger
 * @param {string} name
 * @param {{create: (...params: T) => Plugin}} factory
 * @param {T} input
 * @returns {WrappedPlugin}
 */
export function createPlugin(logger, name, factory, ...input) {
	const plugin = wrap(factory.create, factory)(...input);
	const finalize = plugin.finalize ? wrap(plugin.finalize, plugin) : noop;

	let styleProcessor;
	if (plugin.styleProcessor == null) {
		styleProcessor =
			/** @type {import('./resource-processor.js').StyleProcessor[]} */ ([]);
	} else {
		styleProcessor = (
			isArray(plugin.styleProcessor)
				? plugin.styleProcessor
				: [plugin.styleProcessor]
		).map(processor => {
			return {
				...processor,
				process: wrap(processor.process, processor),
			};
		});
	}

	/** @type {import('typescript').CustomTransformers} */
	const typescriptTransformers = plugin.typescriptTransformers
		? {
				before: plugin.typescriptTransformers.before?.map(
					wrapTransformerFactory,
				),
				after: plugin.typescriptTransformers.after?.map(wrapTransformerFactory),
				afterDeclarations: plugin.typescriptTransformers.afterDeclarations?.map(
					wrapTransformerFactory,
				),
		  }
		: {};

	const processManifest = plugin.processManifest
		? wrap(plugin.processManifest, plugin)
		: noop;

	return {finalize, styleProcessor, typescriptTransformers, processManifest};

	/**
	 * @template {unknown[]} A
	 * @template R
	 * @template T
	 * @param {(this: T, ...args: A) => R} fn
	 * @param {T} thisArg
	 * @returns {(...args: A) => R}
	 */
	function wrap(fn, thisArg) {
		return (...args) => {
			try {
				return fn.apply(thisArg, args);
			} catch (e) {
				if (e instanceof BuildFailureError) {
					throw e;
				}

				logger.error(`An error was thrown in plugin ${name}:`);
				if (e instanceof Error) {
					logger.error(e.message ?? e.stack);
				} else {
					logger.error(String(e));
				}
				logger.error(
					`This is likely a bug in the plugin. If the goal is to fail the build, throw a ${BuildFailureError.name} instead`,
				);

				throw new BuildFailureError(`Unexpected error in plugin ${name}`);
			}
		};
	}

	/**
	 * @template {import('typescript').TransformerFactory<any> | import('typescript').CustomTransformerFactory} F
	 * @param {F} fn
	 * @returns {F}
	 */
	function wrapTransformerFactory(fn) {
		// @ts-expect-error Typescript doesn't seem to like passing in union types to wrap
		const wrappedFn = /** @type {F} */ (wrap(fn, undefined));

		return /** @type {F} */ (
			context => {
				const result = wrappedFn(context);

				if (typeof result === 'function') {
					return wrap(result, undefined);
				}

				return {
					transformBundle: wrap(result.transformBundle, result),
					transformSourceFile: wrap(result.transformSourceFile, result),
				};
			}
		);
	}

	function noop() {}
}
