export function getOrCreate<K, V>(
	map: Map<K, V>,
	key: K,
	factory: (key: K) => V,
): V {
	let value = map.get(key);
	if (value === undefined) {
		value = factory(key);
		map.set(key, value);
	}

	return value;
}

export function memoize<V>(fn: () => V): () => V;
export function memoize<K, V>(fn: (key: K) => V): (key: K) => V;
export function memoize<K, V>(fn: (key: K) => V): (key: K) => V {
	const cache = new Map<K, V>();

	if (fn.length === 0) {
		return () => getOrCreate(cache, undefined!, fn);
	}

	return key => getOrCreate(cache, key, fn);
}
