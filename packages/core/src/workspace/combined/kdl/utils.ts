import type {Document, Node, Value} from 'kdljs';

import {aliasProperties} from '../../../proxy';
import {
	InvalidConfigurationError,
	JsonValue,
	JsonObject,
	UnsupportedOperationError,
} from '../../types';

export function findNode(document: Document, name: string): Node | undefined {
	return document.find(node => node.name === name);
}

function isNotNull<T>(value: T): value is NonNullable<T> {
	return value != null;
}

function sortDescending(value: number[]) {
	value.sort((a, b) => b - a);
}

export function filterNodesInProxy(name: string): ProxyHandler<Document> {
	let view: number[] = [];
	let previousDocument: Document = [];

	function getView(document: Document) {
		if (
			document.length === previousDocument.length &&
			document.every((node, i) => previousDocument[i] === node)
		) {
			return view;
		}

		previousDocument = Array.from(document);
		view = document
			.map((node, i) => (node.name === name ? i : null))
			.filter(isNotNull);

		return view;
	}

	return {
		has(document, p) {
			return Reflect.has(getView(document), p);
		},

		get(document, key, receiver) {
			if (key === 'length') {
				return getView(document).length;
			}

			if (isIntegerKey(key)) {
				const index = getView(document)[Number(key)]!;
				return document[index];
			}

			return Reflect.get(document, key, receiver);
		},

		set(document, key, value, receiver) {
			const view = getView(document);

			if (key === 'length') {
				if (view.length > value) {
					const indicesToRemove = view.slice(value);
					sortDescending(indicesToRemove);

					// This could be optimized when removing consecutive
					// items, but that sounds like overkill
					for (const index of indicesToRemove) {
						document.splice(index, 1);
					}
				} else if (view.length < value) {
					while (view.length < value) {
						view.push(document.push(emptyNode(name)) - 1);
					}
				}

				return true;
			}

			if (isIntegerKey(key)) {
				const index = getView(document)[Number(key)]!;
				return Reflect.set(document, index, value, receiver);
			}

			return false;
		},
	};
}

export interface WrappedString {
	get(): string;
	set(value: string): void;
}

export interface WrappedOptionalString {
	get(): string | null | undefined;
	set(value: string | null | undefined): void;
}

export function findString(
	location: string,
	node: Node,
	name: string,
	required: true,
): WrappedString;
export function findString(
	location: string,
	node: Node,
	name: string,
	required?: boolean,
): WrappedOptionalString;
export function findString(
	location: string,
	node: Node,
	name: string,
	required = false,
): WrappedOptionalString {
	function getChild() {
		const child = findNode(node.children, name);

		if (child == null) {
			return null;
		}

		if (child.children.length) {
			throw new InvalidConfigurationError(
				`Expected ${name} in ${location} not to have children`,
			);
		}

		if (Object.keys(child.properties).length) {
			throw new InvalidConfigurationError(
				`Expected ${name} in ${location} not to have properties`,
			);
		}

		if (child.values.length !== 1) {
			throw new InvalidConfigurationError(
				`Expected ${name} in ${location} to have exactly one value`,
			);
		}

		return child;
	}

	return {
		get() {
			if (Reflect.has(node.properties, name)) {
				const value = node.properties[name];

				if ((required || value != null) && typeof value !== 'string') {
					throw new InvalidConfigurationError(
						`Expected a string at ${location} but got ${JSON.stringify(value)}`,
					);
				}

				return value;
			}

			const child = getChild();

			if (child == null) {
				if (required) {
					throw new InvalidConfigurationError(
						`Expected ${name} to be present in ${location}`,
					);
				}

				return null;
			}

			const [value] = child.values as [Value];

			if ((required || value != null) && typeof value !== 'string') {
				throw new InvalidConfigurationError(
					`Expected ${name} in ${location} to have a string value but got ${JSON.stringify(
						value,
					)}`,
				);
			}

			return value;
		},
		set(value) {
			const child = getChild();
			if (child == null || Reflect.has(node.properties, name)) {
				if (value == null) {
					delete node.properties[name];
				} else {
					node.properties[name] = value;
				}
				return;
			}

			child.values = value !== undefined ? [value] : [];
		},
	};
}

/**
 * Property key used for objects that have values, e.g.
 *
 * ```kdl
 * node "one" "two" prop="value"
 * ```
 *
 * maps to
 *
 * ```json
 * {
 *   "$implicit": ["one", "two"],
 *   "prop": "value"
 * }
 * ```
 */
export const implicitKeyForValue = '$implicit';

const proxyToValueMap = new Map<JsonObject, Node>();
const valueToProxyMap = new Map<Node | Document, JsonObject>();

export function proxyJsonObject(
	nodeOrDocument: Node | Document,
	{
		remove,
		rename,
	}: {
		readonly remove?: ReadonlySet<string>;
		readonly rename?: ReadonlyMap<string, string>;
	} = {},
): JsonObject {
	if (!remove?.size && !rename?.size) {
		const cached = valueToProxyMap.get(nodeOrDocument);
		if (cached != null) {
			return cached;
		}
	}

	let supportProperties = true;
	let node: Node;

	if (Array.isArray(nodeOrDocument)) {
		const newNode = emptyNode('ignore');
		newNode.children = nodeOrDocument;
		node = newNode;

		supportProperties = false;
	} else {
		node = nodeOrDocument;
	}

	const proxy = new Proxy(
		{},
		aliasProperties(
			{remove, rename},
			{
				get(_, property) {
					if (property === implicitKeyForValue) {
						switch (node.values.length) {
							case 0:
								return undefined;
							case 1:
								return node.values[0];
							default:
								// No need to proxy anything here, this is an array of primitives
								return node.values;
						}
					}

					if (Reflect.has(node.properties, property)) {
						return node.properties[property as string];
					}

					const matchingChildren = node.children.filter(
						child => child.name === property,
					);

					switch (matchingChildren.length) {
						case 0:
							return undefined;
						case 1:
							return proxyJsonValue(matchingChildren[0]!);
						default:
							return proxyJsonArray(node, property as string);
					}
				},
				has(_, property) {
					if (property === implicitKeyForValue) {
						return node.values.length > 0;
					}

					return (
						Reflect.has(node.properties, property) ||
						node.children.some(child => child.name === property)
					);
				},
				deleteProperty(_, property) {
					if (property === implicitKeyForValue) {
						node.values = [];
						return true;
					}

					if (Reflect.has(node.properties, property)) {
						if (!Reflect.deleteProperty(node.properties, property)) {
							return false;
						}
					}

					for (let i = node.children.length - 1; i >= 0; i--) {
						if (node.children[i]!.name === property) {
							node.children.splice(i, 1);
						}
					}

					return true;
				},
				defineProperty() {
					throw new UnsupportedOperationError(
						`Object.defineProperty is not supported in KDL workspace configurations`,
					);
				},
				getOwnPropertyDescriptor(_, p) {
					if (this.has!(_, p)) {
						return {
							configurable: true,
							enumerable: true,
							writable: true,
							value: this.get!(_, p, undefined),
						};
					} else {
						return undefined;
					}
				},
				ownKeys() {
					const keys = new Set<string | symbol>();

					if (node.values.length) {
						keys.add(implicitKeyForValue);
					}

					for (const key of Reflect.ownKeys(node.properties)) {
						keys.add(key);
					}

					for (const {name} of node.children) {
						keys.add(name);
					}

					return Array.from(keys);
				},
				set(_, property, value) {
					if (typeof property !== 'string') {
						return false;
					}

					if (property === implicitKeyForValue) {
						node.values = Array.isArray(value) ? value : [value];
						return true;
					}

					if (value === undefined) {
						return this.deleteProperty!(_, property);
					}

					if (value == null || typeof value !== 'object') {
						let endIndex = -1;

						if (Reflect.has(node.properties, property)) {
							node.properties[property] = value;
						} else {
							endIndex = node.children.findIndex(
								child => child.name === property,
							);

							if (endIndex === -1) {
								// property doesn't exist yet

								if (supportProperties) {
									node.properties[property] = value;
								} else {
									addOrReplaceChild(node, property, value);
								}
								return true;
							} else {
								node.children[endIndex]!.children = [];
								node.children[endIndex]!.properties = {};
								node.children[endIndex]!.values = [value];
							}
						}

						for (let i = node.children.length - 1; i > endIndex; i--) {
							if (node.children[i]!.name === property) {
								node.children.splice(i, 1);
							}
						}

						return true;
					}

					if (Array.isArray(value)) {
						const proxyValue = proxyJsonArray(node, property);

						const {length} = value;
						proxyValue.length = length;
						for (let i = 0; i < length; i++) {
							proxyValue[i] = value[i];
						}

						return true;
					}

					// value is an object

					const valueNode = proxyToValueMap.get(value);
					if (valueNode != null) {
						const childIndex = node.children.indexOf(valueNode);

						for (let i = node.children.length - 1; i >= 0; i--) {
							if (i !== childIndex && node.children[i]!.name === property) {
								node.children.splice(i, 1);
							}
						}

						if (childIndex === -1) {
							// should we clone the node? that would break the idea that
							// objects are assigned by reference (though we already break
							// that idea thoroughly for JSON and YAML)
							node.children.push(valueNode);
						}

						return true;
					}

					let endIndex = node.children.findIndex(
						child => child.name === property,
					);

					if (endIndex === -1) {
						const newNode = emptyNode(property);
						node.children.push(newNode);
						endIndex = node.children.length - 1;
					}

					Object.assign(proxyJsonObject(node.children[endIndex]!), value);
					for (let i = node.children.length - 1; i > endIndex; i--) {
						if (node.children[i]!.name === property) {
							node.children.splice(i, 1);
						}
					}

					return true;
				},
			},
		),
	);

	if (!remove?.size && !rename?.size) {
		valueToProxyMap.set(node, proxy);
		proxyToValueMap.set(proxy, node);
	}

	return proxy;
}

function proxyJsonArray(node: Node, name: string): JsonValue[] {
	const baseHandler = filterNodesInProxy(name);

	return new Proxy(node.children, {
		...baseHandler,

		get(document, property, receiver) {
			const value: Node | undefined = baseHandler.get!(
				document,
				property,
				receiver,
			);

			if (value == null || !isIntegerKey(property)) {
				return value;
			}

			return proxyJsonValue(value);
		},

		set(document, property, value, receiver) {
			if (value != null && isIntegerKey(property)) {
				const cachedNode = proxyToValueMap.get(value);

				if (cachedNode != null) {
					value = cachedNode;
				} else {
					const newNode = emptyNode(name);

					if (typeof value === 'object' && !Array.isArray(value)) {
						Object.assign(proxyJsonObject(newNode), value);
					} else {
						newNode.values = value;
					}

					value = newNode;
				}
			}

			return baseHandler.set!(document, property, value, receiver);
		},
	}) as unknown as JsonValue[];
}

function proxyJsonValue(node: Node): JsonValue | undefined {
	if (node.children.length || Reflect.ownKeys(node.properties).length) {
		return proxyJsonObject(node);
	}

	return node.values.length > 1 ? (node.values as JsonValue[]) : node.values[0];
}

function emptyNode(name: string): Node {
	return {
		children: [],
		name,
		properties: {},
		tags: {
			name: '',
			properties: {},
			values: [],
		},
		values: [],
	};
}

function isIntegerKey(key: string | symbol) {
	return typeof key === 'string' && /^[-+]?[0-9]+$/.test(key);
}

export function addOrReplaceChild(
	nodeOrDocument: Node | Document,
	name: string,
	value?: Value,
): Node {
	const newNode = emptyNode(name);
	if (value !== undefined) {
		newNode.values = [value];
	}

	const children = Array.isArray(nodeOrDocument)
		? nodeOrDocument
		: nodeOrDocument.children;

	const existingIndex = children.findIndex(
		child =>
			child.name === name &&
			(value === undefined ||
				(child.values.length === 1 && child.values[0] === value)),
	);
	if (existingIndex !== -1) {
		children.splice(existingIndex, 1, newNode);
	} else {
		children.push(newNode);
	}

	return newNode;
}

export function removeChild(
	nodeOrDocument: Node | Document,
	name: string,
	value?: Value,
): void {
	const children = Array.isArray(nodeOrDocument)
		? nodeOrDocument
		: nodeOrDocument.children;

	const index = children.findIndex(
		child =>
			child.name === name &&
			(value === undefined ||
				(child.values.length === 1 && child.values[0] === value)),
	);

	if (index !== -1) {
		children.splice(index, 1);
	}
}
