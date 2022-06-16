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

export function memoize<K, V>(fn: (key: K) => V): (key: K) => V {
	const cache = new Map<K, V>();

	return key => getOrCreate(cache, key, fn);
}
