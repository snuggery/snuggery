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

    const values = new WeakMap<object, T>();

    descriptor.get = function (this: object) {
      let cached = values.get(this);

      if (cached == null) {
        cached = get.call(this);
        values.set(this, cached);
      }

      return cached;
    };
  };
}
