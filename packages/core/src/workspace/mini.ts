export interface MiniWorkspaceOptions {
	/**
	 * Base name(s) config can be written in
	 */
	basename: Iterable<string>;

	/**
	 * Map of target names to builders
	 */
	targets: ReadonlyMap<string, string>;
}
