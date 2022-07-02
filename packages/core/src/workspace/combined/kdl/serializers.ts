import {Entry, Node, Value} from '@bgotink/kdl';
import {posix} from 'path';

import {
	InvalidConfigurationError,
	isJsonArray,
	isJsonObject,
	JsonValue,
	JsonObject,
} from '../../types';

import type {EntrySerializer} from './kdl-json';
import {findNamedValue} from './kdl-utils';

export function projectRelative(project: Node | JsonObject): EntrySerializer {
	const root =
		project instanceof Node
			? findNamedValue(project, 'root')?.value
			: project.root;

	if (typeof root !== 'string') {
		throw new InvalidConfigurationError(
			`Expected project root to be a string, not ${root && typeof root}`,
		);
	}

	return {
		deserialize(entry: Entry): string {
			const value = entry.value.value;

			if (typeof value !== 'string') {
				throw new InvalidConfigurationError(
					`The (project-relative) tag can only be used on strings, not ${
						value && typeof value
					}`,
				);
			}

			return posix.join(root, value);
		},

		serialize(entry: Entry, value: JsonValue): boolean {
			if (isJsonArray(value) || isJsonObject(value)) {
				return false;
			}

			if (typeof value !== 'string') {
				entry.tag = null;
				entry.value = new Value(value);
				return true;
			}

			const relativePath = posix.relative(root, value);
			if (entry.value.value !== relativePath) {
				entry.value = new Value(relativePath);
			}
			return true;
		},
	};
}
