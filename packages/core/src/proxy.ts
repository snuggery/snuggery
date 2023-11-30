import type {JsonObject} from "./index";

export function aliasProperties(
	{
		remove = new Set(),
		rename = new Map(),
	}: {
		remove?: ReadonlySet<string>;
		rename?: ReadonlyMap<string, string>;
	} = {},
	base: ProxyHandler<JsonObject> = {},
): ProxyHandler<JsonObject> {
	const reverseRename = new Map(
		Array.from(rename, ([name, sourceName]) => [sourceName, name]),
	);

	function toSourceKey(key: string | symbol) {
		if (typeof key === "symbol" || remove.has(key)) {
			return null;
		}

		return rename.get(key) ?? key;
	}

	function fromSourceKey(key: string | symbol) {
		if (typeof key === "symbol" || remove.has(key)) {
			return null;
		}

		return reverseRename.get(key) ?? key;
	}

	return {
		...base,

		get(target, property, receiver) {
			const key = toSourceKey(property);

			if (key == null) {
				return undefined;
			}

			return base.get
				? base.get(target, key, receiver)
				: Reflect.get(target, key, receiver);
		},
		has(target, property) {
			const key = toSourceKey(property);

			if (key == null) {
				return false;
			}

			return base.has?.(target, key) ?? Reflect.has(target, key);
		},
		deleteProperty(target, property) {
			const key = toSourceKey(property);

			if (key == null) {
				return false;
			}

			return (
				base.deleteProperty?.(target, key) ??
				Reflect.deleteProperty(target, key)
			);
		},
		defineProperty(target, property, attributes) {
			const key = toSourceKey(property);

			if (key == null) {
				return false;
			}

			return (
				base.defineProperty?.(target, key, attributes) ??
				Reflect.defineProperty(target, key, attributes)
			);
		},
		getOwnPropertyDescriptor(target, property) {
			const key = toSourceKey(property);

			if (key == null) {
				return undefined;
			}

			return base.getOwnPropertyDescriptor
				? base.getOwnPropertyDescriptor(target, key)
				: Reflect.getOwnPropertyDescriptor(target, key);
		},
		ownKeys(target) {
			return Array.from(base.ownKeys?.(target) ?? Reflect.ownKeys(target))
				.map(fromSourceKey)
				.filter((value: string | null): value is string => value != null);
		},
		set(target, property, value, receiver) {
			const key = toSourceKey(property);

			if (key == null) {
				return false;
			}

			return (
				base.set?.(target, key, value, receiver) ??
				Reflect.set(target, key, value, receiver)
			);
		},
	};
}
