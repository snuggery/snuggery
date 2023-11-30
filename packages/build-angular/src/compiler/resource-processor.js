/**
 * @typedef {Parameters<Required<import('@angular/compiler-cli').CompilerHost>['transformResource']>[1]} ResourceHostContext
 */

import {extname} from "node:path";

import {BuildFailureError} from "./error.js";
import {lessProcessor} from "./resource-processor/less-processor.js";
import {optimizeStyle} from "./resource-processor/optimize.js";
import {postProcess} from "./resource-processor/post-process.js";
import {sassProcessors} from "./resource-processor/sass-processor.js";

/**
 * @typedef {object} ResourceProcessorInput
 * @property {import('./logger.js').Logger} logger
 * @property {ResourceHostContext} context
 * @property {string} content
 */

/**
 * @typedef {object} ProcessedStyle
 * @property {Buffer | string} css
 */

/**
 * @typedef {object} StyleProcessor
 * @property {string} languageName
 * @property {readonly string[]=} fileExtensions
 * @property {(input: ResourceProcessorInput) => ProcessedStyle | Promise<ProcessedStyle>} process
 */

export class ResourceProcessor {
	/** @type {ReadonlyMap<string, StyleProcessor>} */
	#pluginsByLanguageName;

	/** @type {ReadonlyMap<string, StyleProcessor>} */
	#pluginByFileExtension;

	/** @type {string} */
	#inlineStyleLanguage;

	/** @type {import('./logger.js').Logger} */
	#logger;

	/**
	 * @param {import('./logger.js').Logger} logger
	 * @param {readonly import('./plugin.js').WrappedPlugin[]} configuredPlugins
	 * @param {string} inlineStyleLanguage
	 */
	constructor(logger, configuredPlugins, inlineStyleLanguage) {
		this.#logger = logger;

		/** @type {StyleProcessor[]} */
		const plugins = [
			// default plugins, can always be overwritten later on
			{
				languageName: "css",
				fileExtensions: [".css"],
				process: ({content}) => ({css: content}),
			},
			...sassProcessors,
			lessProcessor,

			...configuredPlugins.flatMap((plugin) => plugin.styleProcessor),
		];

		this.#inlineStyleLanguage = inlineStyleLanguage;

		this.#pluginsByLanguageName = new Map(
			plugins.map((plugin) => [plugin.languageName, plugin]),
		);

		this.#pluginByFileExtension = new Map(
			plugins.flatMap((plugin) =>
				(plugin.fileExtensions ?? []).map((extension) => [
					extension.startsWith(".") ? extension : `.${extension}`,
					plugin,
				]),
			),
		);
	}

	/**
	 * @param {string} content
	 * @param {ResourceHostContext} context
	 * @returns {Promise<string>}
	 */
	async getProcessedResource(content, context) {
		if (context.type !== "style") {
			// add explicit check for forward compatibility, to ensure we don't try to
			// process HTML as CSS if angular decides to add template processing support
			return content;
		}

		const file = context.resourceFile ?? context.containingFile;

		const style = await this.#processStyle(content, context);

		const optimizedStyle = await optimizeStyle(style.css.toString(), file);
		const finalStyle = await postProcess(optimizedStyle.css, file);

		return finalStyle.css;
	}

	/**
	 *
	 * @param {string} content
	 * @param {ResourceHostContext} context
	 */
	async #processStyle(content, context) {
		let plugin;
		if (context.resourceFile != null) {
			plugin = this.#pluginByFileExtension.get(extname(context.resourceFile));
			if (!plugin) {
				throw new BuildFailureError(
					`No plugin installed supporting file extension ${JSON.stringify(
						extname(context.resourceFile),
					)}, supported extensions are ${Array.from(
						this.#pluginByFileExtension.keys(),
						(v) => JSON.stringify(v),
					).join(", ")}`,
				);
			}
		} else {
			plugin = this.#pluginsByLanguageName.get(this.#inlineStyleLanguage);
			if (!plugin) {
				throw new BuildFailureError(
					`No plugin installed for configured inlineStyleLanguage ${JSON.stringify(
						this.#inlineStyleLanguage,
					)}`,
				);
			}
		}

		const processed = await plugin.process({
			logger: this.#logger,
			content,
			context,
		});

		const cssPlugin = /** @type {StyleProcessor} */ (
			this.#pluginsByLanguageName.get("css")
		);
		if (cssPlugin === plugin) {
			return processed;
		} else {
			return await cssPlugin.process({
				logger: this.#logger,
				content: processed.css.toString(),
				context,
			});
		}
	}
}
