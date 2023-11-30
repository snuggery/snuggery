import type {
	JsonPropertyName,
	JsonObject,
	JsonPropertyPath,
	JsonValue,
} from "../types";

import {Tracker, makeTracker} from "./tracker";
import {Change, ChangeType} from "./types";

type ChangeMap = Map<JsonPropertyName, Change | ChangeMap>;

function findChange(map: ChangeMap, path: JsonPropertyPath): Change | null {
	if (path.length === 0) {
		return null;
	}

	const [prop, ...rest] = path as [string, ...string[]];
	const recordedValue = map.get(prop);

	if (recordedValue == null) {
		return null;
	}

	if (recordedValue instanceof Map) {
		return findChange(recordedValue, rest);
	} else {
		return recordedValue;
	}
}

function findChangeMap(
	map: ChangeMap,
	path: JsonPropertyPath,
): ChangeMap | null {
	if (path.length === 1) {
		return map;
	}

	const [prop, ...rest] = path as [JsonPropertyName, ...JsonPropertyPath];
	let recordedValue = map.get(prop);

	if (recordedValue == null) {
		recordedValue = new Map();
		map.set(prop, recordedValue);
	}

	if (recordedValue instanceof Map) {
		return findChangeMap(recordedValue, rest);
	} else {
		return null;
	}
}

function setChange(map: ChangeMap, change: Change) {
	findChangeMap(map, change.path)!.set(
		change.path[change.path.length - 1]!,
		change,
	);
}

function mergeChanges(map: ChangeMap, change: Change, previousChange: Change) {
	switch (change.type) {
		case ChangeType.Add: {
			// The last change adds the property, which implies the previous change was a deletion
			// -> merge the two into a modification

			setChange(map, {
				type: ChangeType.Modify,
				path: change.path,
				value: change.value,
				oldValue: (previousChange as Change & {type: ChangeType.Delete})
					.oldValue,
			});
			break;
		}
		case ChangeType.Delete:
			// More recent change deletes the property, ignore any previous action unless the
			// previous action was adding the property in the first place, because then the two
			// actions cancel out

			if (previousChange.type === ChangeType.Add) {
				findChangeMap(map, change.path)!.delete(
					change.path[change.path.length - 1]!,
				);
			} else {
				setChange(map, {...change, oldValue: previousChange.oldValue});
			}
			break;
		case ChangeType.Modify:
			// Property was modified -> the previous action should be add or modify, merge the two

			switch (previousChange.type) {
				case ChangeType.Add:
					setChange(map, {...previousChange, value: change.value});
					break;
				case ChangeType.Modify:
					setChange(map, {
						...change,
						oldValue: previousChange.oldValue,
					});
					break;
				case ChangeType.Delete: {
					// If the previous change somehow was deletion (== bug somewhere) the most likely good
					// result is to keep the deletion in place
				}
			}
	}
}

function getAllChanges(map: ChangeMap, changes: Change[]) {
	for (const value of map.values()) {
		if (value instanceof Map) {
			getAllChanges(value, changes);
		} else {
			changes.push(value);
		}
	}

	return changes;
}

function combineChanges(allChanges: readonly Change[]): Change[] {
	const changeMap: ChangeMap = new Map();

	for (const change of allChanges) {
		const closestChange = findChange(changeMap, change.path);

		if (closestChange == null) {
			// Property didn't change yet, nor one of its parent objects -> record the change
			setChange(changeMap, change);
		} else if (change.path.length === closestChange.path.length) {
			// Property itself changed multiple times, merge changes
			mergeChanges(changeMap, change, closestChange);
		} else {
			// A parent object changed, we can ignore this change
		}
	}

	return getAllChanges(changeMap, []);
}

export function makeCombinedTracker<T extends JsonObject | JsonValue[]>(
	value: T,
): Tracker<T>;
export function makeCombinedTracker<T extends JsonObject | JsonValue[]>(
	original: T,
): Tracker<T> {
	const originalTracker = makeTracker(original);

	return {
		open() {
			const {value, close} = originalTracker.open();

			return {
				value,
				close() {
					return combineChanges(close());
				},
			};
		},
	};
}
