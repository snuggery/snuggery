import {AssetSpec} from '@snuggery/architect';

export interface Schema {
	/**
	 * Path to the `package.json` file
	 *
	 * Defaults to the `package.json` file in the project folder
	 */
	manifest?: string;

	/**
	 * Main file
	 *
	 * Defaults to the `main` or `exports` property of the manifest
	 */
	main?: string;

	/**
	 * Typescript configuration file, defaults to `tsconfig.json` in the project root
	 */
	tsconfig?: string;

	/**
	 * Extra assets to copy
	 */
	assets?: AssetSpec[];

	/**
	 * Packager to run after building, e.g. `@snuggery/yarn:pack`
	 *
	 * If the builder name is `pack` it can be left, out, e.g. `@snuggery/yarn` will run the same builder as `@snuggery/yarn:pack`.
	 */
	packager?: string;

	/**
	 * The folder to build the package to, defaults to `<projectFolder>/dist`
	 */
	outputFolder?: string;

	/**
	 * Whether to keep `devDependencies` in the `package.json`, defaults to `false`
	 */
	keepScripts?: boolean;

	/**
	 * Whether to keep `devDependencies` in the `package.json`, defaults to `false`
	 */
	keepDevDependencies?: boolean;

	/**
	 * Plugins to load
	 */
	plugins?: (string | [string, JsonObject])[];

	/**
	 * Language for inline styles, defaults to `'css'`
	 */
	inlineStyleLanguage?: string;

	/**
	 * Flags that change how the angular packages are built by this builder
	 */
	flags?: {
		/**
		 * Angular mistakenly generates deep imports for local packages.
		 *
		 * This package implements two approaches to fix this behavior:
		 * - Using a private angular API that gives control over the generated
		 *   import paths.
		 * - By modifying the generated imports afterwards, which is tightly
		 *   coupled to the exact output that angular generates these files in.
		 *
		 * By default the private API is used.
		 */
		usePrivateApiAsImportIssueWorkaround?: boolean;

		/**
		 * Disable API flattening
		 *
		 * API flattening is prescribed by the Angular Package Format, but
		 * executing the `@microsoft/api-extractor` code can double the build
		 * time of a package.
		 */
		enableApiExtractor?: boolean;

		/**
		 * Whether the `outputFolder` defaults to a centralized folder or a folder per package
		 *
		 * If no `outputFolder` is set and this flag is `true`, the output folder is
		 * `<rootFolder>/dist/<packageName>`.
		 * If no `outputFolder` is set and this flag is `false`, the output folder is a folder
		 * called `dist` next to the primary entry point's `package.json` file.
		 *
		 * The default value of this flag is `true` when in a Plug'n'Play environment, and false
		 * otherwise.
		 * In a PnP environment a centralized folder means these package outputs cannot access
		 * their dependencies. This makes the built angular packages harder to use, while using
		 * these is a useful validation step in a release pipeline.
		 */
		useCentralOutputFolder?: boolean;
	};
}
