// cspell:ignore unparse serializers

/**
 * @fileoverview Implements two-way conversion between the workspace configuration types and
 * the experimental KDL format supported by snuggery (snuggery.kdl, version 0)
 */

import {Document, format, InvalidKdlError, parse} from '@bgotink/kdl';

import type {TextFileHandle} from '../../file';
import {makeCombinedTracker} from '../../proxy';
import type {FileHandle, FileHandleContext} from '../../split/file/types';
import {AngularWorkspaceHandle} from '../../split/workspace-handle/angular';
import {InvalidConfigurationError, type JsonObject} from '../../types';

import {applyChangeToWorkspace} from './apply-changes';
import {expandDocument} from './kdl-utils';
import {parseWorkspace} from './parse';
import {serializeWorkspace} from './serialize';

function formatHeader(header?: string | string[]) {
	if (header == null) {
		return '';
	}

	if (Array.isArray(header)) {
		return `/*\n${header.map(line => ` * ${line}`).join('\n')}\n */\n`;
	}

	return `// ${header}\n`;
}

export type {SnuggeryWorkspaceFileHandle};
class SnuggeryWorkspaceFileHandle implements FileHandle {
	#context: FileHandleContext<SnuggeryWorkspaceFileHandle>;

	readonly filename: string;

	constructor(context: FileHandleContext<SnuggeryWorkspaceFileHandle>) {
		this.#context = context;

		this.filename = context.source.basename;
	}

	async readDocument(): Promise<Document> {
		const content = await this.#context.source.read();
		let document: Document;
		try {
			document = parse(content);
		} catch (e) {
			if (e instanceof InvalidKdlError) {
				throw new InvalidConfigurationError(e.message);
			}

			throw e;
		}

		const {updateReady} = this.#context;
		if (updateReady != null) {
			this.#context.updateReady = updateReady.then(() =>
				this.#context.source.write(format(document)),
			);
		}

		return document;
	}

	async read(): Promise<JsonObject> {
		const document = await this.readDocument();
		const expandedDocument = await expandDocument(document, this);

		return parseWorkspace(expandedDocument);
	}

	async update(
		updater: (value: JsonObject) => void | Promise<void>,
	): Promise<void> {
		if (this.#context.updateReady != null) {
			throw new Error('Configuration is already being updated');
		}

		let markReady: () => void;
		this.#context.updateReady = new Promise<void>(resolve => {
			markReady = resolve;
		});

		const document = await this.readDocument();
		const allDocuments: Document[] = [];
		const expandedDocument = await expandDocument(document, this, allDocuments);

		const {value, close} = makeCombinedTracker(
			parseWorkspace(expandedDocument),
		).open();
		await updater(value);

		const changes = close();

		for (const change of changes) {
			applyChangeToWorkspace(document, expandedDocument, allDocuments, change);
		}

		markReady!();

		await this.#context.updateReady;
		this.#context.updateReady = undefined;
	}

	async write(
		value: JsonObject,
		{header}: {header?: string | string[]},
	): Promise<void> {
		await this.#context.source.write(
			formatHeader(header) + format(serializeWorkspace(value)),
		);
	}

	openRelative(path: string, supportedFilenames?: string[] | undefined) {
		return this.#context.openRelative(path, supportedFilenames);
	}

	openDependency(path: string, supportedFilenames?: string[] | undefined) {
		return this.#context.openDependency(path, supportedFilenames);
	}
}

function createFileHandle(
	source: TextFileHandle,
	context: {updateReady?: Promise<void>} = {},
): SnuggeryWorkspaceFileHandle {
	return new SnuggeryWorkspaceFileHandle({
		source,

		get updateReady() {
			return context.updateReady;
		},
		set updateReady(updateReady) {
			context.updateReady = updateReady;
		},

		async openRelative(path, supportedFilenames) {
			const newSource = await source.openRelative(path, supportedFilenames);

			if (newSource == null) {
				throw new InvalidConfigurationError(
					`Cannot find configuration file ${JSON.stringify(path)}`,
				);
			}

			return createFileHandle(newSource, context);
		},
		async openDependency(path, supportedFilenames) {
			const newSource = await source.openDependency(path, supportedFilenames);

			if (newSource == null) {
				throw new InvalidConfigurationError(
					`Cannot find configuration file ${JSON.stringify(path)}`,
				);
			}

			return createFileHandle(newSource, context);
		},
	});
}

export class SnuggeryKdlWorkspaceHandle extends AngularWorkspaceHandle {
	constructor(source: TextFileHandle) {
		super(createFileHandle(source));
	}
}
