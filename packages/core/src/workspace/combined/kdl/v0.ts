// cspell:ignore unparse serializers

/**
 * @fileoverview Implements two-way conversion between the workspace configuration types and
 * the experimental KDL format supported by snuggery (snuggery.kdl, version 0)
 */

import {Document, format, InvalidKdlError, parse} from '@bgotink/kdl';

import type {TextFileHandle} from '../../file';
import type {Change} from '../../proxy';
import {AbstractFileHandle} from '../../split/file/abstract';
import {AngularWorkspaceHandle} from '../../split/workspace-handle/angular';
import {InvalidConfigurationError, type JsonObject} from '../../types';

import {applyChangeToWorkspace} from './apply-changes';
import {parseWorkspace} from './parse';
import {serializeWorkspace} from './serialize';

class SnuggeryWorkspaceFileHandle extends AbstractFileHandle<Document> {
	parse(content: string): Document {
		try {
			return parse(content);
		} catch (e) {
			if (e instanceof InvalidKdlError) {
				throw new InvalidConfigurationError(e.message);
			}

			throw e;
		}
	}

	getValue(document: Document): JsonObject {
		return parseWorkspace(document);
	}

	stringify(value: JsonObject): string {
		return format(serializeWorkspace(value));
	}

	createHeader(header: string | string[]): string {
		if (Array.isArray(header)) {
			return `/*\n${header.map(line => ` * ${line}`).join('\n')}\n */\n`;
		}

		return `// ${header}\n`;
	}

	applyChanges(
		_source: string,
		document: Document,
		changes: readonly Change[],
	): string {
		for (const change of changes) {
			applyChangeToWorkspace(document, change);
		}

		return format(document);
	}
}

export class SnuggeryKdlWorkspaceHandle extends AngularWorkspaceHandle {
	constructor(source: TextFileHandle) {
		super(
			new SnuggeryWorkspaceFileHandle({
				source,
				async createFileHandle() {
					throw new InvalidConfigurationError(
						'Split KDL files are not currently supported',
					);
				},
			}),
		);
	}
}
