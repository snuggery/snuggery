export interface Schema {
	/**
	 * Base directory in which to look for tests, defaults to the project folder
	 */
	readonly dir?: string;

	/**
	 * Tests to execute
	 */
	readonly pattern?: string;

	/**
	 * Any file patterns to ignore
	 */
	readonly ignore?: string | string[];

	/**
	 * Exit on first failure
	 */
	readonly bail?: boolean;

	/**
	 * Additional module(s) to preload
	 */
	readonly require?: string | string[];
}
