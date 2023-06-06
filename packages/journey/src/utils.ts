/* eslint-disable @typescript-eslint/ban-types */

export class Map<K, V extends {}> extends globalThis.Map<K, V> {
	readonly #factory: (key: K) => V;

	constructor(factory: (key: K) => V) {
		super();
		this.#factory = factory;
	}

	override get(key: K): V {
		let value = super.get(key);

		if (value == null) {
			value = this.#factory(key);
			this.set(key, value);
		}

		return value;
	}
}

export class WeakMap<K extends object, V extends {}> extends globalThis.WeakMap<
	K,
	V
> {
	readonly #factory: (key: K) => V;

	constructor(factory: (key: K) => V) {
		super();
		this.#factory = factory;
	}

	override get(key: K): V {
		let value = super.get(key);

		if (value == null) {
			value = this.#factory(key);
			this.set(key, value);
		}

		return value;
	}
}
