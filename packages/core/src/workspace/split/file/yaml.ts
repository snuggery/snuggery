import type * as YAML from 'yaml';

import {Change, ChangeType} from '../../proxy';
import {
	InvalidConfigurationError,
	isJsonObject,
	JsonObject,
	JsonPropertyPath,
	stringifyPath,
} from '../../types';

import {AbstractFileHandle} from './abstract';

const yamlOptions: YAML.DocumentOptions &
	YAML.SchemaOptions &
	YAML.ToStringOptions = {
	// Use YAML 1.2
	version: '1.2',
	// Run with the `core` schema but disable certain non-JSON-compatible tags
	schema: 'core',
	resolveKnownTags: false,
	// But support merges (<<) which are not included in the 1.2 spec
	merge: true,
};

function processParseErrors(errors: readonly YAML.YAMLError[]) {
	if (errors.length === 1) {
		const [error] = errors as [YAML.YAMLError];
		throw new InvalidConfigurationError(
			`Error while parsing YAML file: ${error.message} at ${error.pos.join(
				':',
			)}`,
		);
	} else if (errors.length > 0) {
		throw new InvalidConfigurationError(
			`Errors while parsing YAML file:\n- ${errors
				.map((error) => `${error.message} at ${error.pos.join(':')}`)
				.join('\n- ')}`,
		);
	}
}

export class YamlFileHandle extends AbstractFileHandle<
	YAML.Document.Parsed<YAML.ParsedNode>
> {
	#YAML: typeof YAML = require('yaml');

	async parse(source: string): Promise<YAML.Document.Parsed<YAML.ParsedNode>> {
		const document = this.#YAML.parseDocument(source, yamlOptions);

		processParseErrors(document.errors);

		return document;
	}

	getValue(document: YAML.Document.Parsed<YAML.ParsedNode>): JsonObject {
		const value = document.toJSON();

		if (!isJsonObject(value)) {
			throw new InvalidConfigurationError('Configuration must be an object');
		}

		return value;
	}

	stringify(value: JsonObject): string {
		return this.#YAML.stringify(value, yamlOptions);
	}

	createHeader(header: string | string[]): string {
		return `# ${[header].flat().join('\n# ')}\n`;
	}

	applyChanges(
		_source: string,
		document: YAML.Document.Parsed<YAML.ParsedNode>,
		changes: readonly Change[],
	): string {
		const YAML = this.#YAML;
		function assertIsCollection(
			node: YAML.ParsedNode | YAML.Node | null | undefined,
			path: JsonPropertyPath,
		): asserts node is YAML.YAMLMap | YAML.YAMLSeq {
			if (node == null || !(YAML.isMap(node) || YAML.isSeq(node))) {
				throw new Error(`Failed to modify ${stringifyPath(path)}`);
			}
		}

		function clone(node: YAML.Node) {
			const clone = node.clone();

			// Remove any anchor on the cloned node.
			if (YAML.isNode(clone)) {
				clone.anchor = undefined;
			}

			// If the node contains other nodes, replace any nodes with an anchor with aliases to the
			// anchor, to prevent unnecessary duplication.
			if (YAML.isCollection(clone)) {
				YAML.visit(clone, {
					Node(_key, node): YAML.Node | void {
						if (node.anchor != null) {
							return document.createAlias(node);
						}
					},
				});
			}

			return clone;
		}

		// cspell:ignore unaliased
		const unaliasedAliases = new Map<YAML.Node, YAML.YAMLMap>();

		for (const change of changes) {
			let node = document.contents as YAML.YAMLMap | YAML.YAMLSeq;
			let isLastNodeAlias = false;
			let isPropertyPresentInMerge = false;

			for (let i = 0; i < change.path.length; i++) {
				const prop = change.path[i]!;
				const isLast = i === change.path.length - 1;

				isPropertyPresentInMerge = false;
				if (YAML.isMap(node) && node.has('<<')) {
					// We're passing a merge, and the value we want to change is merged into the object
					// -> clone the property to the object itself so we can override it

					let source = node.get('<<', true) as YAML.Node;
					let resolvedSource;

					if (!YAML.isAlias(source)) {
						throw new Error('Expected << to be an alias');
					}

					const seen = new Set<YAML.Node>();
					do {
						resolvedSource = source.resolve(document);
						assertIsCollection(resolvedSource, change.path);

						if (seen.has(resolvedSource)) {
							resolvedSource = null;
							break;
						}
						seen.add(resolvedSource);

						if (resolvedSource.has(prop)) {
							break;
						} else if (resolvedSource.has('<<')) {
							source = resolvedSource.get('<<', true) as YAML.Node;
						} else {
							resolvedSource = null;
							break;
						}
					} while (YAML.isAlias(source));

					if (resolvedSource != null) {
						isPropertyPresentInMerge = true;

						if (!node.has(prop)) {
							node.set(
								prop,
								clone(resolvedSource.get(prop, true) as YAML.Node),
							);
						}
					}
				}

				if (isLast) {
					continue;
				}

				const nextNode = node.get(prop, true) as YAML.Node | null;

				if (YAML.isAlias(nextNode)) {
					// We'll be modifying a property on an alias, so we have to turn it into a merge to
					// prevent changing all instances of the alias
					const resolvedAlias = nextNode.resolve(document);

					assertIsCollection(resolvedAlias, change.path);

					let newNode = unaliasedAliases.get(resolvedAlias);
					if (newNode == null) {
						newNode = document.createNode({
							'<<': document.createAlias(resolvedAlias),
						}) as YAML.YAMLMap;

						unaliasedAliases.set(resolvedAlias, newNode);
					}

					const nextProp = change.path[i + 1]!;
					if (!newNode.has(nextProp) && resolvedAlias.has(nextProp)) {
						newNode.set(
							nextProp,
							clone(resolvedAlias.get(nextProp, true) as YAML.Node),
						);
					}

					node.set(prop, newNode);

					node = newNode;
					isLastNodeAlias = true;
				} else {
					assertIsCollection(nextNode, change.path);

					node = nextNode;
					isLastNodeAlias = false;
				}
			}

			switch (change.type) {
				case ChangeType.Add:
					node.add({
						key: change.path[change.path.length - 1]!,
						value: change.value,
					});
					break;
				case ChangeType.Delete:
					if (isLastNodeAlias || isPropertyPresentInMerge) {
						node.set(change.path[change.path.length - 1], null);
					} else {
						node.delete(change.path[change.path.length - 1]!);
					}
					break;
				case ChangeType.Modify:
					node.set(change.path[change.path.length - 1]!, change.value);
					break;
			}
		}

		return document.toString();
	}
}
