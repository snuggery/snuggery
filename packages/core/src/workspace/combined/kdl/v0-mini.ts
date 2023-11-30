// cspell:ignore unparse serializers

/**
 * @fileoverview Implements two-way conversion between the workspace configuration types and
 * the experimental KDL format supported by snuggery (snuggery.kdl, version 0)
 */

import type {Document} from "@bgotink/kdl";

import type {TextFileHandle} from "../../file";
import {AngularWorkspaceHandle} from "../../split/workspace-handle/angular";
import type {JsonObject} from "../../types";

import {AbstractKdlWorkspaceFileHandle} from "./kdl-utils";
import {parseMiniWorkspace} from "./parse";

class MiniSnuggeryWorkspaceFileHandle extends AbstractKdlWorkspaceFileHandle {
	readonly #targets: ReadonlyMap<string, string>;

	constructor(
		source: TextFileHandle,
		targets: ReadonlyMap<string, string>,
		context?: {updateReady?: Promise<void>},
	) {
		super(source, context);
		this.#targets = targets;
	}

	protected createChildHandle(
		source: TextFileHandle,
		context: {updateReady?: Promise<void> | undefined},
	) {
		return new MiniSnuggeryWorkspaceFileHandle(source, this.#targets, context);
	}

	protected parseWorkspace(document: Document): JsonObject {
		return parseMiniWorkspace(document, this.#targets);
	}

	protected serializeWorkspace(): Document {
		throw new Error("Unsupported operation");
	}

	protected applyChangeToWorkspace(): void {
		throw new Error("Unsupported operation");
	}
}

export class MiniSnuggeryKdlWorkspaceHandle extends AngularWorkspaceHandle {
	constructor(source: TextFileHandle, targets: ReadonlyMap<string, string>) {
		super(new MiniSnuggeryWorkspaceFileHandle(source, targets));
	}
}
