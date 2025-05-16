/* eslint-disable @typescript-eslint/no-empty-object-type */
import {matchesPatterns, type Patterns} from "@snuggery/core";

export class MapWithDefault<K, V extends {}> extends globalThis.Map<K, V> {
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

export class PatternKeyedMap<K, IK, V> {
	readonly [Symbol.toStringTag] = "PatternKeyedMap";

	readonly #maps: [Patterns | null, Map<K, ReadonlyMap<IK, V>>][];

	constructor(iterable: Iterable<[K, Patterns | null, ReadonlyMap<IK, V>]>) {
		this.#maps = [];

		let lastPatterns: Patterns | null | undefined;
		let lastMap: Map<K, ReadonlyMap<IK, V>> | undefined;

		for (const [key, patterns, value] of iterable) {
			if (patterns !== lastPatterns) {
				lastPatterns = patterns;
				lastMap = new Map();
				this.#maps.push([patterns, lastMap]);
			}

			lastMap!.set(key, value);
		}
	}

	get(path: string): ReadonlyMap<K, ReadonlyMap<IK, V>> | undefined {
		let resultMap: ReadonlyMap<K, ReadonlyMap<IK, V>> | undefined;

		for (const [pattern, map] of this.#maps) {
			if (pattern === null || matchesPatterns(path, pattern)) {
				resultMap = new Map(resultMap ? [...resultMap, ...map] : map);
			}
		}

		return resultMap;
	}
}

export class WeakMapWithDefault<
	K extends object,
	V extends {},
> extends globalThis.WeakMap<K, V> {
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
