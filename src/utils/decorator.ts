export function Cached(): MethodDecorator {
  return <T>(
    target: Object,
    key: keyof any,
    descriptor: TypedPropertyDescriptor<T>,
  ) => {
    const {get, set} = descriptor;

    if (get == null || set != null) {
      throw new Error(
        `Can't decorate ${target.constructor.name}#${String(
          key,
        )}, @Cached() requires a getter only`,
      );
    }

    const values = new WeakMap<object, {value: T} | {error: unknown}>();

    descriptor.get = function (this: object) {
      let cached = values.get(this);

      if (cached == null) {
        try {
          cached = {value: get.call(this)};
        } catch (e) {
          cached = {error: e};
        }

        values.set(this, cached);
      }

      if ('value' in cached) {
        return cached.value;
      } else {
        throw cached.error;
      }
    };
  };
}
