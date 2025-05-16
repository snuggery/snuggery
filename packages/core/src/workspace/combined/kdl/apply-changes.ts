import {Document, Entry, Node} from "@bgotink/kdl";

import {Change, ChangeType} from "../../proxy";
import type {JsonObject, JsonPropertyName, JsonPropertyPath} from "../../types";

import {
	collectParameterizedSubContexts,
	getSingleStringValue,
	ParserContext,
} from "./context";
import {applyChangeToJsonValue} from "./jik/apply-changes";
import {fromJsonObject, fromJsonValue} from "./jik/serialize";
import {isChildOf, setTag, tagOverwrite} from "./kdl-utils";
import {addProjectRelativeTag} from "./parse";
import {
	serializeConfiguration,
	serializeProject,
	serializeTarget,
} from "./serialize";

// Helpers

function applyChangeToNamedMap(
	context:
		| (ParserContext & {node: Node})
		| (Omit<ParserContext, "node" | "location"> & {node: Document}),
	nodeName: string,
	change: Change,
) {
	if (change.type === ChangeType.Delete) {
		context.node.removeNodesByName(nodeName);
		return;
	}

	const nodes = Object.entries(change.value as Record<string, JsonObject>).map(
		([name, value]) => {
			const node = fromJsonObject(nodeName, value, {
				allowEntries: false,
			});
			node.entries.unshift(Entry.createArgument(name));
			return node;
		},
	);

	if (change.type === ChangeType.Add) {
		context.node.appendNode(new Document(nodes));
		return;
	}

	const existingNodes = new Set(
		collectParameterizedSubContexts(context, nodeName).keys(),
	);
	for (const node of nodes) {
		if (!existingNodes.has(node.getArgument(0) as string)) {
			node.setTag(tagOverwrite);
		}
	}
	const firstExistingNode = context.node.findNodeByName(nodeName);
	const document =
		context.node instanceof Document ?
			context.node
		:	(context.node.children ?? (context.node.children = new Document()));

	let added = false;

	document.nodes = document.nodes.flatMap((n) => {
		if (n === firstExistingNode) {
			added = true;
			return nodes;
		}

		return n.getName() === nodeName ? [] : n;
	});

	if (!added) {
		document.appendNode(new Document(nodes));
	}
}

// Workspace configuration

function applyChangeToConfigurations(
	context: ParserContext,
	path: JsonPropertyPath,
	change: Change,
) {
	if (path.length === 0) {
		applyChangeToNamedMap(context, "configuration", change);
		return;
	}

	let name: string;
	// eslint-disable-next-line prefer-const
	[name, ...path] = path as [string, ...JsonPropertyPath];
	const {node} = context;

	const configuration = collectParameterizedSubContexts(
		context,
		"configuration",
	).get(name);

	if (path.length === 0) {
		if (change.type === ChangeType.Delete) {
			node.removeNode(configuration!.node);
			return;
		}

		const newConfiguration = serializeConfiguration(
			name,
			change.value as JsonObject,
		);

		if (change.type === ChangeType.Add || !configuration) {
			node.appendNode(newConfiguration);
		} else if (!isChildOf(node, configuration.node)) {
			node.appendNode(setTag(tagOverwrite, newConfiguration));
		} else if (configuration.extends != null) {
			node.replaceNode(
				configuration.node,
				setTag(tagOverwrite, newConfiguration),
			);
		} else {
			node.replaceNode(configuration.node, newConfiguration);
		}

		return;
	}

	return applyChangeToJsonValue(
		configuration!,
		path as [JsonPropertyName, ...JsonPropertyPath],
		change,
		{allowEntries: false},
	);
}

function applyChangeToTargets(
	context: ParserContext & {node: Node},
	path: JsonPropertyPath,
	change: Change,
): void {
	if (path.length === 0) {
		applyChangeToNamedMap(context, "target", change);
		return;
	}

	let name: string;
	[name, ...path] = path as [string, ...JsonPropertyPath];

	const target = collectParameterizedSubContexts(context, "target").get(name);

	if (path.length === 0) {
		if (change.type === ChangeType.Delete) {
			context.node.removeNode(target!.node);
			return;
		}

		const newTarget = serializeTarget(name, change.value as JsonObject);

		if (change.type === ChangeType.Add) {
			context.node.appendNode(newTarget);
		} else if (!target) {
			context.node.appendNode(newTarget);
		} else if (!isChildOf(context.node, target.node)) {
			context.node.appendNode(setTag(tagOverwrite, newTarget));
		} else if (target.extends != null) {
			context.node.replaceNode(target.node, setTag(tagOverwrite, newTarget));
		} else {
			context.node.replaceNode(target.node, newTarget);
		}
		return;
	}

	[name, ...path] = path as [string, ...JsonPropertyPath];

	if (name === "configurations") {
		applyChangeToConfigurations(target!, path, change);
	} else {
		applyChangeToJsonValue(target!, [name, ...path], change, {
			allowEntries: name !== "options",
		});
	}
}

function applyChangeToProjects(
	document: Document,
	expandedDocument: Document,
	allDocuments: readonly Document[],
	path: JsonPropertyPath,
	change: Change,
): void {
	if (path.length === 0) {
		// Remove all projects from imported documents,
		// Then apply the change to the main document
		for (const doc of allDocuments) {
			if (doc !== document) {
				doc.removeNodesByName("project");
			}
		}

		applyChangeToNamedMap(
			{
				tags: new Map(),
				node: document,
			},
			"project",
			change,
		);
		return;
	}

	let name: string;
	[name, ...path] = path as [string, ...JsonPropertyPath];

	const projects = collectParameterizedSubContexts(
		{
			tags: new Map(),
			node: expandedDocument,
		},
		"project",
	);
	let project = projects.get(name);

	if (project) {
		project = addProjectRelativeTag(
			{
				...project,
				extends:
					project.node.hasProperty("extends") ?
						projects.get(project.node.getProperty("extends") as string)
					:	undefined,
			},
			getSingleStringValue(project, "root"),
		);
	}

	if (path.length === 0) {
		const ownerDocument =
			project && allDocuments.find((doc) => doc.nodes.includes(project!.node))!;

		if (change.type === ChangeType.Delete) {
			ownerDocument!.removeNode(project!.node);
			return;
		}

		const newProject = serializeProject(name, change.value as JsonObject);

		if (change.type === ChangeType.Add) {
			document.appendNode(newProject);
		} else if (!project) {
			document.appendNode(newProject);
		} else if (!isChildOf(ownerDocument!, project.node)) {
			ownerDocument!.appendNode(newProject);
		} else {
			ownerDocument!.replaceNode(project.node, newProject);
		}
		return;
	}

	[name, ...path] = path as [string, ...JsonPropertyPath];

	if (name === "targets") {
		applyChangeToTargets(project!, path, change);
	} else {
		applyChangeToJsonValue(project!, [name, ...path], change, {
			allowEntries: name !== "cli",
		});
	}
}

export function applyChangeToWorkspace(
	document: Document,
	expandedDocument: Document,
	allDocuments: readonly Document[],
	change: Change,
): void {
	const [name, ...path] = change.path.slice() as [string, ...JsonPropertyPath];

	if (name === "version") {
		return;
	}

	if (name === "projects") {
		return applyChangeToProjects(
			document,
			expandedDocument,
			allDocuments,
			path,
			change,
		);
	}

	if (path.length > 0) {
		return applyChangeToJsonValue(
			{
				tags: new Map(),
				node: expandedDocument.findNodeByName(name)!,
			},
			path as [JsonPropertyName, ...JsonPropertyPath],
			change,
			{allowEntries: false},
		);
	}

	// applyChangeToJsonValue requires a node, which we can't provide here

	if (change.type === ChangeType.Add) {
		// Add to the main document
		document.appendNode(
			fromJsonValue(name, change.value, {
				allowEntries: false,
			}),
		);
		return;
	}

	const node = expandedDocument.findNodeByName(name)!;
	const ownerDocument = allDocuments.find((doc) => doc.nodes.includes(node))!;

	if (change.type === ChangeType.Delete) {
		ownerDocument.removeNode(node);
		return;
	}

	ownerDocument.replaceNode(
		node,
		fromJsonValue(name, change.value, {
			allowEntries: false,
		}),
	);
}
