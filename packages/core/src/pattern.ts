/**
 * Filter the given list via the given inclusion and optional exclusion pattern(s)
 *
 * @param list The list of items to filter
 * @param options The options
 */
export function filterByPatterns(
	list: string[],
	{
		include,
		exclude,
	}: {
		include: string | readonly string[];
		exclude?: string | readonly string[];
	},
): string[] {
	const match = require("micromatch") as typeof import("micromatch");

	const included = match(list, include);

	if (exclude == null || exclude.length === 0) {
		return included;
	}

	return match.not(included, exclude);
}

/**
 * Check whether the given path matches the given inclusion and optional exclusion pattern(s)
 *
 * @param path The path to compare
 * @param options The options
 */
export function matchesPatterns(
	path: string,
	{
		include,
		exclude,
	}: {
		include: string | readonly string[];
		exclude?: string | readonly string[];
	},
): boolean {
	const match = require("micromatch") as typeof import("micromatch");

	return (
		match.isMatch(path, include) && (!exclude || !match.isMatch(path, exclude))
	);
}
