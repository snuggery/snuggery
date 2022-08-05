/**
 * @fileoverview Utilities for tracking changes in serializable values, dubbed JSON values
 *
 * This is a heavily modified copy of @yarnpkg/json-proxy's tracking mechanism, taken from
 * https://github.com/yarnpkg/berry/blob/83311e1d4d/packages/yarnpkg-json-proxy/sources/makeTracker.ts
 *
 * Copyright (c) 2016-present, Yarn Contributors. All rights reserved.
 * Licensed under the BSD 2-Clause License, https://github.com/yarnpkg/berry/blob/83311e1d4d/LICENSE.md
 */

import type {
	JsonObject,
	JsonPropertyName,
	JsonPropertyPath,
	JsonValue,
} from '../types';

import {Change, ChangeType} from './types';

type Version = Record<never, never>;

const versions = new WeakMap<JsonObject | JsonValue[], Version>();

/** isNaN accepts non-number values, but typescript doesn't seem to know that */
declare function isNaN(value: unknown): boolean;

function cloneValue<T extends JsonValue>(value: T, version?: Version): T {
	if (typeof value !== 'object' || value == null) {
		return value;
	}

	if (version != null && versions.get(value) === version) {
		return value;
	}

	let clonedValue: T & (JsonValue[] | JsonObject);

	if (Array.isArray(value)) {
		clonedValue = value.slice() as T & JsonValue[];
	} else {
		clonedValue = {...(value as JsonObject)} as T & JsonObject;
	}

	if (version != null) {
		versions.set(clonedValue, version);
	}
	return clonedValue;
}

function cloneValueDeep<T extends JsonValue>(value: T, version?: Version): T {
	if (typeof value !== 'object' || value == null) {
		return value;
	}

	if (version != null && versions.get(value) === version) {
		return value;
	}

	let clonedValue: T & (JsonValue[] | JsonObject);
	if (Array.isArray(value)) {
		clonedValue = value.map(subValue => {
			return cloneValueDeep(subValue, version);
		}) as T & JsonValue[];
	} else {
		clonedValue = Object.fromEntries(
			Object.entries(value).map(([key, value]) => [
				key,
				cloneValueDeep(value, version),
			]),
		) as T & JsonObject;
	}

	if (version != null) {
		versions.set(clonedValue, version);
	}
	return clonedValue;
}

function compareValuesDeep(a: JsonValue, b: JsonValue): boolean {
	if (a === b) {
		return true;
	}

	if (a == null || b == null) {
		return false;
	}

	if (Array.isArray(a)) {
		if (!Array.isArray(b)) return false;
		if (a.length !== b.length) return false;

		for (let t = 0, T = a.length; t < T; ++t)
			if (!compareValuesDeep(a[t]!, b[t]!)) return false;

		return true;
	}

	if (typeof a === 'object') {
		if (typeof b !== 'object' || Array.isArray(b)) {
			return false;
		}

		const aKeys = Object.keys(a);
		const bKeys = Object.keys(b);

		if (aKeys.length !== bKeys.length) return false;

		for (let t = 0, T = aKeys.length; t < T; ++t)
			if (aKeys[t] !== bKeys[t]) return false;

		for (let t = 0, T = aKeys.length; t < T; ++t)
			if (!compareValuesDeep(a[aKeys[t]!]!, b[bKeys[t]!]!)) return false;

		return true;
	}

	return false;
}

function makeValueObservable<T extends JsonObject | JsonValue[]>(
	value: T,
	version: Version,
	changes: ChangeTracker,
	ensureCloning: () => T,
	revocations: (() => void)[],
): T {
	const isArray = Array.isArray(value);

	const {proxy, revoke} = Proxy.revocable(value, {
		get(source, prop): JsonValue | undefined {
			if (
				typeof prop === 'symbol' ||
				!Reflect.has(source, prop) ||
				(isArray && prop !== 'length' && isNaN(prop))
			) {
				// JSON can't use symbol keys
				return undefined;
			}

			// @ts-expect-error typescript can't tell prop indexes source
			const value: JsonValue = source[prop];

			if (typeof value !== 'object' || value == null) {
				return value;
			}

			return makeValueObservable(
				value,
				version,
				changes.createSubTracker(isArray ? Number(prop) : prop),
				() => {
					const clonedParent = ensureCloning();

					// @ts-expect-error typescript can't tell prop indexes source
					const immutableValue = clonedParent[prop]!;
					const clonedValue = cloneValue(immutableValue, version);

					// @ts-expect-error typescript can't tell prop indexes source
					clonedParent[prop] = clonedValue;

					return clonedValue;
				},
				revocations,
			);
		},
		deleteProperty(source, prop): boolean {
			if (typeof prop === 'symbol') {
				return false;
			}

			if (!Reflect.has(source, prop) || (isArray && isNaN(prop))) {
				return false;
			}

			// @ts-expect-error typescript can't tell prop indexes source
			changes.delete(isArray ? Number(prop) : prop, source[prop]);

			// @ts-expect-error typescript can't tell prop indexes source
			delete source[prop];

			return true;
		},
		set(source, prop, value: JsonValue): boolean {
			if (typeof prop === 'symbol') {
				// JSON can't have symbol keys
				return false;
			}

			if (isArray && (isNaN(prop) || !Number.isInteger(Number(prop)))) {
				// JSON doesn't allow index properties on arrays
				return false;
			}

			if (value === undefined && !isArray) {
				if (Reflect.has(source, prop)) {
					const clonedParent = ensureCloning();

					// @ts-expect-error typescript can't tell prop indexes source
					const oldValue = source[prop];

					// @ts-expect-error typescript can't tell prop indexes source
					delete clonedParent[prop];

					changes.delete(prop, oldValue);
				}
			} else if (!Reflect.has(source, prop)) {
				const clonedParent = ensureCloning();

				const clonedValue = cloneValueDeep(value, version);
				// @ts-expect-error typescript can't tell prop indexes source
				clonedParent[prop] = clonedValue;

				changes.add(isArray ? Number(prop) : prop, clonedValue);
			} else {
				// @ts-expect-error typescript can't tell prop indexes source
				const currentValue = source[prop]!;

				if (!compareValuesDeep(currentValue, value)) {
					// We ensure that our parent is cloned, then assign the new value into it
					const clonedParent = ensureCloning();

					const clonedValue = cloneValueDeep(value, version);
					// @ts-expect-error typescript can't tell prop indexes source
					clonedParent[prop] = clonedValue;

					changes.modify(
						isArray ? Number(prop) : prop,
						clonedValue,
						currentValue,
					);
				}
			}

			// @ts-expect-error typescript can't tell prop indexes source
			source[prop] = value;

			return true;
		},
	});

	revocations.push(revoke);
	return proxy;
}

interface ChangeTracker {
	add(path: JsonPropertyName, value: JsonValue): void;
	delete(path: JsonPropertyName, oldValue: JsonValue): void;
	modify(path: JsonPropertyName, value: JsonValue, oldValue: JsonValue): void;

	createSubTracker(path: JsonPropertyName): ChangeTracker;
}

function createChangeTracker(
	changes: Change[],
	parentPath: JsonPropertyPath,
): ChangeTracker {
	return {
		add(path, value) {
			changes.push({type: ChangeType.Add, path: [...parentPath, path], value});
		},
		delete(path, oldValue) {
			changes.push({
				type: ChangeType.Delete,
				path: [...parentPath, path],
				oldValue,
			});
		},
		modify(path, value, oldValue) {
			changes.push({
				type: ChangeType.Modify,
				path: [...parentPath, path],
				value,
				oldValue,
			});
		},
		createSubTracker(path: JsonPropertyName) {
			return createChangeTracker(changes, [...parentPath, path]);
		},
	};
}

export interface Tracker<T> {
	open(): {
		value: T;
		close(): readonly Change[];
	};
}

export function makeTracker<T extends JsonObject | JsonValue[]>(
	value: T,
): Tracker<T>;
export function makeTracker<T extends JsonObject | JsonValue[]>(
	original: T,
): Tracker<T> {
	let value = cloneValueDeep(original);

	return {
		open() {
			// A value guaranteed to be different from everything except itself
			const version = {};
			const changes: Change[] = [];
			const revocations: (() => void)[] = [];

			return {
				value: makeValueObservable(
					value,
					version,
					createChangeTracker(changes, []),
					() => {
						value = cloneValue(value, version);
						return value;
					},
					revocations,
				),
				close() {
					for (const revoke of revocations) {
						revoke();
					}

					return changes;
				},
			};
		},
	};
}
