export function unpackSingleValue<T>(value: T[]): T | T[] {
	return value.length === 1 ? value[0]! : value;
}
