import {aliasProperties} from "../../proxy";
import type {JsonObject} from "../types";

export function proxyObject(
	object: JsonObject,
	{
		remove,
		rename,
	}: {
		readonly remove?: Set<string>;
		readonly rename?: Map<string, string>;
	},
): JsonObject {
	return new Proxy(object, aliasProperties({remove, rename}));
}
