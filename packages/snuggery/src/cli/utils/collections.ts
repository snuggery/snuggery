export class SetMap<K, V> extends Map<K, Set<V>> {
	override get(key: K): Set<V> {
		let value = super.get(key);

		if (value == null) {
			value = new Set();
			super.set(key, value);
		}

		return value;
	}
}
