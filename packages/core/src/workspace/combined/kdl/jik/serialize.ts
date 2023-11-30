import {Document, Entry, Node} from "@bgotink/kdl";

import {
	isJsonArray,
	isJsonObject,
	type JsonObject,
	type JsonValue,
} from "../../../types";
import {isArrayOfPrimitives} from "../json-utils";
import {implicitPropertyKey} from "../kdl-utils";

import {namelessName} from "./utils";

export function fromJsonValue(
	name: string,
	jsonValue: JsonValue,
	{allowEntries = true} = {},
): Node {
	if (isJsonArray(jsonValue)) {
		return fromJsonArray(name, jsonValue);
	} else if (isJsonObject(jsonValue)) {
		return fromJsonObject(name, jsonValue, {allowEntries});
	}

	const node = Node.create(name);
	node.addArgument(jsonValue);
	return node;
}

function fromJsonArray(name: string, jsonValue: JsonValue[]): Node {
	const node = Node.create(name);

	if (jsonValue.length === 0) {
		node.setTag("array");
		return node;
	}

	if (isArrayOfPrimitives(jsonValue)) {
		if (jsonValue.length === 1) {
			node.setTag("array");
		}

		node.entries = jsonValue.map((item) => Entry.createArgument(item));
		return node;
	}

	node.children = new Document(
		jsonValue.map((item) => fromJsonValue(namelessName, item)),
	);
	return node;
}

export function fromJsonObject(
	name: string,
	jsonValue: JsonObject,
	{allowEntries = true} = {},
): Node {
	const node = Node.create(name);
	const properties = Object.entries(jsonValue);

	if (properties.length === 0) {
		node.setTag("object");
		return node;
	}

	const children: Node[] = [];

	for (const [property, propertyValue] of properties) {
		if (property === implicitPropertyKey) {
			if (isJsonArray(propertyValue)) {
				if (isArrayOfPrimitives(propertyValue)) {
					node.entries.unshift(
						...propertyValue.map((item) => Entry.createArgument(item)),
					);
					continue;
				}
			} else if (!isJsonObject(propertyValue)) {
				node.entries.unshift(Entry.createArgument(propertyValue));
				continue;
			}
		}

		if (
			!allowEntries ||
			isJsonObject(propertyValue) ||
			isJsonArray(propertyValue)
		) {
			children.push(fromJsonValue(property, propertyValue));
		} else {
			node.setProperty(property, propertyValue);
		}
	}

	if (children.length > 0) {
		node.children = new Document(children);
	}

	return node;
}
