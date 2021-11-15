import type {JsonObject} from '../types';

export function proxyObject(
	object: JsonObject,
	{
		remove = new Set(),
		rename = new Map(),
	}: {
		remove?: Set<string>;
		rename?: Map<string, string>;
	},
): JsonObject {
	const reverseRename = new Map(
		Array.from(rename, ([name, sourceName]) => [sourceName, name]),
	);

	function toSourceKey(key: string | symbol) {
		if (typeof key === 'symbol' || remove.has(key)) {
			return null;
		}

		return rename.get(key) ?? key;
	}

	function fromSourceKey(key: string | symbol) {
		if (typeof key === 'symbol' || remove.has(key)) {
			return null;
		}

		return reverseRename.get(key) ?? key;
	}

	return new Proxy(object, {
		get(target, property) {
			const key = toSourceKey(property);

			if (key == null) {
				return undefined;
			}

			return Reflect.get(target, key);
		},
		has(target, property) {
			const key = toSourceKey(property);

			return key != null && Reflect.has(target, key);
		},
		deleteProperty(target, property) {
			const key = toSourceKey(property);

			return key != null && Reflect.deleteProperty(target, key);
		},
		defineProperty(target, property, descriptor) {
			const key = toSourceKey(property);

			return key != null && Reflect.defineProperty(target, key, descriptor);
		},
		getOwnPropertyDescriptor(target, property) {
			const key = toSourceKey(property);

			if (key == null) {
				return undefined;
			}

			return Reflect.getOwnPropertyDescriptor(target, key);
		},
		ownKeys(target) {
			return Reflect.ownKeys(target).filter(key => fromSourceKey(key) != null);
		},
		set(target, property, value) {
			const key = toSourceKey(property);

			if (key == null) {
				return false;
			}

			return Reflect.set(target, key, value);
		},
	});
}
