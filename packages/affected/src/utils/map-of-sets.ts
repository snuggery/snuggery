export class MapOfSets<K, V> extends Map<K, Set<V>> {
	override get(key: K): Set<V> {
		let val = super.get(key);

		if (val == null) {
			val = new Set();
			super.set(key, val);
		}

		return val;
	}
}
