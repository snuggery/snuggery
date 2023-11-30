// cspell:ignore unparse serializers

/**
 * @fileoverview Implements two-way conversion between the workspace configuration types and
 * the experimental KDL format supported by snuggery (snuggery.kdl, version 0)
 */

import type {Document} from "@bgotink/kdl";

import type {TextFileHandle} from "../../file";
import type {Change} from "../../proxy";
import {AngularWorkspaceHandle} from "../../split/workspace-handle/angular";
import type {JsonObject} from "../../types";

import {applyChangeToWorkspace} from "./apply-changes";
import {AbstractKdlWorkspaceFileHandle} from "./kdl-utils";
import {parseWorkspace} from "./parse";
import {serializeWorkspace} from "./serialize";

class SnuggeryWorkspaceFileHandle extends AbstractKdlWorkspaceFileHandle {
	protected createChildHandle(
		source: TextFileHandle,
		context: {updateReady?: Promise<void> | undefined},
	) {
		return new SnuggeryWorkspaceFileHandle(source, context);
	}

	protected parseWorkspace(document: Document): JsonObject {
		return parseWorkspace(document);
	}

	protected serializeWorkspace(workspace: JsonObject): Document {
		return serializeWorkspace(workspace);
	}

	protected applyChangeToWorkspace(
		document: Document,
		expandedDocument: Document,
		allDocuments: readonly Document[],
		change: Change,
	): void {
		return applyChangeToWorkspace(
			document,
			expandedDocument,
			allDocuments,
			change,
		);
	}
}

export class SnuggeryKdlWorkspaceHandle extends AngularWorkspaceHandle {
	constructor(source: TextFileHandle) {
		super(new SnuggeryWorkspaceFileHandle(source));
	}
}
