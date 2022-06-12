/**
 * @fileoverview Implements two-way conversion between the workspace configuration types and
 * the experimental KDL format supported by snuggery (snuggery.kdl, version 0)
 */

import type {workspaces} from '@angular-devkit/core';
import type {Document, Node} from 'kdljs';

import {
	InvalidConfigurationError,
	JsonObject,
	UnsupportedOperationError,
	ConvertibleWorkspaceDefinition,
	ProjectDefinition,
	ProjectDefinitionCollection,
	TargetDefinition,
	TargetDefinitionCollection,
	WorkspaceDefinition,
} from '../../types';

import {
	addOrReplaceChild,
	findString,
	implicitKeyForValue,
	proxyJsonObject,
	removeChild,
	WrappedOptionalString,
	WrappedString,
} from './utils';

class SnuggeryTargetDefinition implements TargetDefinition {
	static fromConfiguration(
		projectName: string,
		targetName: string,
		node: Node,
	) {
		return new this(projectName, targetName, node);
	}

	static fromValue(
		{
			builder,
			configurations,
			defaultConfiguration,
			options,
			extensions = {},
		}:
			| TargetDefinition
			| (workspaces.TargetDefinition & {extensions?: undefined}),
		projectName: string,
		targetName: string,
		node: Node,
	) {
		const instance = new this(projectName, targetName, node);

		instance.builder = builder;

		if (defaultConfiguration != null) {
			instance.defaultConfiguration = defaultConfiguration;
		}

		if (options != null) {
			instance.options = options as JsonObject;
		}

		if (configurations != null) {
			instance.configurations = configurations as Record<string, JsonObject>;
		}

		Object.assign(instance.extensions, extensions);

		return instance;
	}

	readonly #node: Node;
	readonly #location: string;
	readonly #builder: WrappedString;
	readonly #defaultConfiguration: WrappedOptionalString;

	readonly extensions: JsonObject;

	private constructor(projectName: string, targetName: string, node: Node) {
		this.#node = node;

		const location = (this.#location = `target ${JSON.stringify(
			targetName,
		)} in project ${JSON.stringify(projectName)}`);
		this.#builder = findString(location, node, 'builder', true);
		this.#defaultConfiguration = findString(
			location,
			node,
			'defaultConfiguration',
		);

		this.extensions = proxyJsonObject(node, {
			remove: new Set([
				implicitKeyForValue,
				'builder',
				'defaultConfiguration',
				'options',
				'configurations',
			]),
		});
	}

	get builder(): string {
		return this.#builder.get();
	}

	set builder(builder: string) {
		this.#builder.set(builder);
	}

	get defaultConfiguration(): string | undefined {
		return this.#defaultConfiguration.get() ?? undefined;
	}

	set defaultConfiguration(defaultConfiguration: string | undefined) {
		this.#defaultConfiguration.set(defaultConfiguration);
	}

	get options(): JsonObject | undefined {
		const nodes = this.#node.children.filter(child => child.name === 'options');

		switch (nodes.length) {
			case 0:
				return undefined;
			case 1:
				return proxyJsonObject(nodes[0]!);
			default:
				throw new InvalidConfigurationError(
					`More than one \`options\` found in ${this.#location}`,
				);
		}
	}

	set options(options: JsonObject | undefined) {
		if (options != null) {
			const node = addOrReplaceChild(this.#node, 'options');

			Object.assign(proxyJsonObject(node), options);
		} else {
			removeChild(this.#node, 'options');
		}
	}

	get configurations(): Record<string, JsonObject> | undefined {
		const node = this.#node;
		const proxyOptions = {remove: new Set([implicitKeyForValue])};

		if (
			!node.children.some(
				child => child.name === 'configuration' && child.values.length === 1,
			)
		) {
			return undefined;
		}

		return new Proxy<Record<string, JsonObject>>(
			{},
			{
				defineProperty() {
					throw new UnsupportedOperationError(
						`Object.defineProperty is not supported in KDL workspace configurations`,
					);
				},
				getOwnPropertyDescriptor() {
					throw new UnsupportedOperationError(
						`Object.getOwnPropertyDescriptor is not supported in KDL workspace configurations`,
					);
				},
				preventExtensions() {
					throw new UnsupportedOperationError(
						`Object.preventExtensions is not supported in KDL workspace configurations`,
					);
				},

				ownKeys() {
					return node.children
						.filter(
							child =>
								child.name === 'configuration' && child.values.length === 1,
						)
						.map(child => String(child.values[0]));
				},

				has(_, name) {
					return node.children.some(
						child =>
							child.name === 'configuration' &&
							child.values.length === 1 &&
							child.values[0] === name,
					);
				},

				get(_, name) {
					const configurationNode = node.children.find(
						child =>
							child.name === 'configuration' &&
							child.values.length === 1 &&
							child.values[0] === name,
					);

					return (
						configurationNode &&
						proxyJsonObject(configurationNode, proxyOptions)
					);
				},

				set(_, name, value) {
					if (typeof name !== 'string') {
						return false;
					}

					const configurationNode = addOrReplaceChild(
						node,
						'configuration',
						name,
					);
					Object.assign(
						proxyJsonObject(configurationNode, proxyOptions),
						value,
					);

					return true;
				},
			},
		);
	}

	set configurations(configurations: Record<string, JsonObject> | undefined) {
		if (configurations == null) {
			for (let i = this.#node.children.length - 1; i >= 0; i--) {
				if (this.#node.children[i]!.name === 'configuration') {
					this.#node.children.splice(i, 1);
				}
			}

			return;
		}

		const proxyOptions = {remove: new Set([implicitKeyForValue])};
		const newNodes = new Set<Node>();

		for (const [name, configuration] of Object.entries(configurations)) {
			const node = addOrReplaceChild(this.#node, 'configuration', name);
			Object.assign(proxyJsonObject(node, proxyOptions), configuration);

			newNodes.add(node);
		}

		for (let i = this.#node.children.length - 1; i >= 0; i--) {
			const child = this.#node.children[i]!;
			if (child.name === 'configuration' && !newNodes.has(child)) {
				this.#node.children.splice(i, 1);
			}
		}

		return;
	}
}

class SnuggeryTargetDefinitionCollection extends TargetDefinitionCollection {
	static fromConfiguration(projectName: string, node: Node) {
		return new this(
			Object.fromEntries(
				node.children
					.filter(
						child =>
							child.name === 'target' &&
							child.values.length === 1 &&
							typeof child.values[0] === 'string',
					)
					.map(child => {
						const targetName = child.values[0] as string;

						return [
							targetName,
							SnuggeryTargetDefinition.fromConfiguration(
								projectName,
								targetName,
								child,
							),
						];
					}),
			),
			projectName,
			node,
		);
	}

	static fromValue(
		projectName: string,
		value: workspaces.TargetDefinitionCollection,
		node: Node,
	) {
		const initial = Object.fromEntries(
			Array.from(value, ([targetName, originalDefinition]) => {
				const definition = SnuggeryTargetDefinition.fromValue(
					originalDefinition,
					projectName,
					targetName,
					addOrReplaceChild(node, 'target', targetName),
				);

				return [targetName, definition];
			}),
		);

		return new this(initial, projectName, node);
	}

	readonly #projectName: string;
	readonly #node: Node;

	private constructor(
		initial: Record<string, TargetDefinition>,
		projectName: string,
		node: Node,
	) {
		super(initial);
		this.#projectName = projectName;
		this.#node = node;
	}

	protected override _wrapValue(
		key: string,
		value: TargetDefinition | workspaces.TargetDefinition,
	): TargetDefinition {
		const node = addOrReplaceChild(this.#node, 'target', key);
		return SnuggeryTargetDefinition.fromValue(
			value,
			this.#projectName,
			key,
			node,
		);
	}

	protected override _unwrapValue(key: string): void {
		removeChild(this.#node, 'target', key);
	}
}

class SnuggeryProjectDefinition implements ProjectDefinition {
	static fromConfiguration(projectName: string, node: Node) {
		return new this(
			SnuggeryTargetDefinitionCollection.fromConfiguration(projectName, node),
			projectName,
			node,
		);
	}

	static fromValue(
		projectName: string,
		value: ProjectDefinition | workspaces.ProjectDefinition,
		node: Node,
	) {
		const instance = new this(
			SnuggeryTargetDefinitionCollection.fromValue(
				projectName,
				value.targets,
				node,
			),
			projectName,
			node,
		);

		instance.root = value.root;
		instance.sourceRoot = value.sourceRoot;
		instance.prefix = value.prefix;

		Object.assign(instance.extensions, value.extensions);

		return instance;
	}

	readonly #root: WrappedString;
	readonly #prefix: WrappedOptionalString;
	readonly #sourceRoot: WrappedOptionalString;

	readonly extensions: JsonObject;
	readonly targets: SnuggeryTargetDefinitionCollection;

	constructor(
		targets: SnuggeryTargetDefinitionCollection,
		projectName: string,
		node: Node,
	) {
		this.targets = targets;

		this.extensions = proxyJsonObject(node, {
			remove: new Set([
				'root',
				'prefix',
				'sourceRoot',
				'target',
				implicitKeyForValue,
			]),
		});

		const location = `project ${JSON.stringify(projectName)}`;
		this.#root = findString(location, node, 'root', true);
		this.#prefix = findString(location, node, 'prefix');
		this.#sourceRoot = findString(location, node, 'sourceRoot');
	}

	get root(): string {
		return this.#root.get();
	}

	set root(root: string) {
		this.#root.set(root);
	}

	get prefix(): string | undefined {
		return this.#prefix.get() ?? undefined;
	}

	set prefix(prefix: string | undefined) {
		this.#prefix.set(prefix);
	}

	get sourceRoot(): string | undefined {
		return this.#sourceRoot.get() ?? undefined;
	}

	set sourceRoot(sourceRoot: string | undefined) {
		this.#sourceRoot.set(sourceRoot);
	}
}

class SnuggeryProjectDefinitionCollection extends ProjectDefinitionCollection {
	static fromConfiguration(document: Document) {
		return new this(
			document,
			Object.fromEntries(
				document
					.filter(
						child =>
							child.name === 'project' &&
							child.values.length === 1 &&
							typeof child.values[0] === 'string',
					)
					.map(child => {
						const projectName = child.values[0] as string;

						return [
							projectName,
							SnuggeryProjectDefinition.fromConfiguration(projectName, child),
						];
					}),
			),
		);
	}

	static fromValue(
		value: ProjectDefinitionCollection | workspaces.ProjectDefinitionCollection,
		document: Document,
	) {
		return new this(
			document,
			Object.fromEntries(
				Array.from(value, ([projectName, originalDefinition]) => [
					projectName,
					SnuggeryProjectDefinition.fromValue(
						projectName,
						originalDefinition,
						addOrReplaceChild(document, 'project', projectName),
					),
				]),
			),
		);
	}

	readonly #document: Document;

	private constructor(
		document: Document,
		initial: Record<string, ProjectDefinition>,
	) {
		super(initial);
		this.#document = document;
	}

	protected override _wrapValue(
		key: string,
		value: ProjectDefinition,
	): ProjectDefinition {
		return SnuggeryProjectDefinition.fromValue(
			key,
			value,
			addOrReplaceChild(this.#document, 'project', key),
		);
	}

	protected override _unwrapValue(key: string): void {
		removeChild(this.#document, 'project', key);
	}
}

export class SnuggeryWorkspaceDefinition extends ConvertibleWorkspaceDefinition {
	static fromConfiguration(document: Document) {
		return new this(
			SnuggeryProjectDefinitionCollection.fromConfiguration(document),
			document,
		);
	}

	static fromValue(
		value: WorkspaceDefinition | workspaces.WorkspaceDefinition,
	) {
		if (value instanceof SnuggeryWorkspaceDefinition) {
			return value;
		}

		const document: Document = [];

		document.push(addOrReplaceChild(document, 'version', 0));

		const instance = new this(
			SnuggeryProjectDefinitionCollection.fromValue(value.projects, document),
			document,
		);

		// Assign to the proxyObject to ensure renames and removes are applied
		Object.assign(instance.extensions, value.extensions);

		return instance;
	}

	readonly extensions: JsonObject;
	readonly projects: SnuggeryProjectDefinitionCollection;

	readonly document: Document;

	constructor(
		projects: SnuggeryProjectDefinitionCollection,
		document: Document,
	) {
		super();
		this.projects = projects;

		this.extensions = proxyJsonObject(document, {
			remove: new Set(['projects', 'version', '$schema']),
		});

		this.document = document;
	}
}
