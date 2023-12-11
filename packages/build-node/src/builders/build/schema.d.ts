import {AssetSpec} from "@snuggery/architect";

export interface Schema {
	/**
	 * Whether to compile via typescript, defaults to true
	 */
	compile?: boolean;

	/**
	 * Path to the tsconfig.json file, defaults to `<projectFolder>/tsconfig.json`
	 */
	tsconfig?: string;

	/**
	 * Whether to keep the scripts in package.json, defaults to false
	 */
	keepScripts?: boolean;

	/**
	 * Whether to keep `devDependencies` in the `package.json`, defaults to `false`
	 */
	keepDevDependencies?: boolean;

	/**
	 * Assets to copy
	 */
	assets?: AssetSpec[];

	/**
	 * Whether to package the built... package
	 */
	package?: boolean | null;

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
	 * Plugins to load
	 */
	plugins?: (string | [string, JsonObject])[];
}
