export function isntNull<T>(value: T): value is NonNullable<T> {
  return value != null;
}
