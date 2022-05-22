/**
 * @template T
 * @param {(T[] | undefined)[]} arrays
 * @returns {T[] | undefined}
 */
function combine(...arrays) {
	const flattened = /** @type {T[][]} */ (
		arrays.filter(value => value != null)
	).flat();

	return flattened.length > 0 ? flattened : undefined;
}

/**
 *
 * @param {import('typescript').CustomTransformers} angularTransformers
 * @param {import('typescript').CustomTransformers} ownTransformers
 * @param {readonly import('../plugin.js').WrappedPlugin[]} plugins
 * @returns {import('typescript').CustomTransformers}
 */
export function combineTransformers(
	angularTransformers,
	ownTransformers,
	plugins,
) {
	return {
		after: combine(
			angularTransformers.after,
			ownTransformers.after,
			...plugins.map(plugin => plugin.typescriptTransformers.after),
		),
		afterDeclarations: combine(
			angularTransformers.afterDeclarations,
			ownTransformers.afterDeclarations,
			...plugins.map(plugin => plugin.typescriptTransformers.afterDeclarations),
		),
		before: combine(
			angularTransformers.before,
			ownTransformers.before,
			...plugins.map(plugin => plugin.typescriptTransformers.before),
		),
	};
}
