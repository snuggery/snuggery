export function Cached(): MethodDecorator {
	return <T>(
		target: object,
		key: string | symbol,
		descriptor: TypedPropertyDescriptor<T>,
	) => {
		const {get, set, value} = descriptor;
		const values = new WeakMap<object, {value: unknown} | {error: unknown}>();

		if (value !== undefined) {
			if (typeof value !== "function") {
				throw new Error(
					`Can't decorate ${target.constructor.name}#${String(
						key,
					)}, @Cached() requires a getter-only property or a method`,
				);
			}

			if (value.length !== 0) {
				throw new Error(
					`Can't decorate ${target.constructor.name}#${String(
						key,
					)}, @Cached() doesn't support parameters`,
				);
			}

			descriptor.value = function (this: object) {
				let cached = values.get(this);

				if (cached == null) {
					try {
						cached = {value: value.call(this)};
					} catch (e) {
						cached = {error: e};
					}

					values.set(this, cached);
				}

				if ("value" in cached) {
					return cached.value;
				} else {
					throw cached.error;
				}
			} as unknown as T;
		} else {
			if (get == null || set != null) {
				throw new Error(
					`Can't decorate ${target.constructor.name}#${String(
						key,
					)}, @Cached() requires a getter-only property or a method`,
				);
			}

			descriptor.get = function (this: object) {
				let cached = values.get(this);

				if (cached == null) {
					try {
						cached = {value: get!.call(this)};
					} catch (e) {
						cached = {error: e};
					}

					values.set(this, cached);
				}

				if ("value" in cached) {
					return cached.value as T;
				} else {
					throw cached.error;
				}
			};
		}
	};
}
