import {BuildFailureError} from "./error.js";

/**
 * A plugin for the `@snuggery/build-angular` library compiler
 *
 * Plugins can provide several extension points, all of which are optional.
 * The timing in which these extension points are called or used is not defined, except for the `finalize` hook which is guaranteed to be called once at the end of the compilation.
 *
 * @typedef {object} Plugin
 * @property {import('./resource-processor.js').StyleProcessor | readonly import('./resource-processor.js').StyleProcessor[]} [styleProcessor] Extra style processor(s)
 *
 * These style processors can
 * - add extra languages, e.g. `stylus`
 * - override the built-in compilers for SASS or LESS
 * - add an extra processing step for all styles by registering a processor for the `css` language.
 *
 * The compiler has default processors for SASS (`'sass'`, with extensions `.sass` and `.scss`), LESS (`'less'` with extension `.less`) and CSS (`'css'` with file extension `.css`).
 *
 * The compiler first runs the processor for the input file, or configured inline style language for inline styles.
 * Then the compiler runs the processor for the `'css'` language, if that's not the same processor it already ran.
 * The result is then optimized and passed through `autoprefixer`.
 *
 * @property {import('typescript').CustomTransformers} [typescriptTransformers] `CustomTransformers` to be passed to the typescript compiler
 *
 * The `typescriptTransformers` of all plugins are combined in the order in which the plugins are configured.
 *
 * @property {import('esbuild').Plugin['setup']} [esbuildPlugin] Plugin setup function to pass into esbuild when flattening code
 *
 * The `esbuildPlugin`s of all plugins are passed into esbuild in the order in which the plugins are configured.
 *
 * @property {(manifest: import('@snuggery/core').JsonObject) => void} [processManifest] Function called with the manifest
 *
 * This function is called once for every `package.json` that is written in the output folder.
 * The manifest will already be filled in by the compiler, with `scripts` and `devDependencies` removed if so configured.
 *
 * @property {() => void} [finalize] Function called when the compilation is complete
 *
 * This function is called exactly once when the compilation is complete.
 * Use this for clean-up or to e.g. perform validations on information collected in the other hooks.
 */

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
 * @property {import('esbuild').Plugin} esbuildPlugin
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
		).map((processor) => {
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

	const esbuildPlugin = {name, setup: plugin.esbuildPlugin ?? noop};

	return {
		finalize,
		styleProcessor,
		typescriptTransformers,
		processManifest,
		esbuildPlugin,
	};

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
			(context) => {
				const result = wrappedFn(context);

				if (typeof result === "function") {
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
