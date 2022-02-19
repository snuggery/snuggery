import match, {not as matchNot} from 'micromatch';

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
	const included = match(list, include);

	if (exclude == null || exclude.length === 0) {
		return included;
	}

	return matchNot(included, exclude);
}
