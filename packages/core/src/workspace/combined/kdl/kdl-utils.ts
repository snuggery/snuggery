import {Document, format, InvalidKdlError, Node, parse} from '@bgotink/kdl';

import type {TextFileHandle} from '../../file';
import {Change, makeCombinedTracker} from '../../proxy';
import type {FileHandle, FileHandleContext} from '../../split/file/types';
import {InvalidConfigurationError, JsonObject} from '../../types';

export const arrayItemKey = '-';

export const implicitPropertyKey = '$implicit';

export const tagOverwrite = 'overwrite';

export function isChildOf(parent: Node | Document, child: Node) {
	return (
		(parent instanceof Document ? parent : parent.children)?.nodes.includes(
			child,
		) || false
	);
}

export function setTag(tag: string | null, node: Node) {
	node.setTag(tag);
	return node;
}

function formatHeader(header?: string | string[]) {
	if (header == null) {
		return '';
	}

	if (Array.isArray(header)) {
		return `/*\n${header.map((line) => ` * ${line}`).join('\n')}\n */\n`;
	}

	return `// ${header}\n`;
}

export abstract class AbstractKdlWorkspaceFileHandle implements FileHandle {
	#context: FileHandleContext<AbstractKdlWorkspaceFileHandle>;

	readonly filename: string;

	constructor(
		source: TextFileHandle,
		context: {updateReady?: Promise<void>} = {},
	) {
		this.#context = {
			source,

			get updateReady() {
				return context.updateReady;
			},
			set updateReady(updateReady) {
				context.updateReady = updateReady;
			},

			openRelative: async (path, supportedFilenames) => {
				const newSource = await source.openRelative(path, supportedFilenames);

				if (newSource == null) {
					throw new InvalidConfigurationError(
						`Cannot find configuration file ${JSON.stringify(path)}`,
					);
				}

				return this.createChildHandle(newSource, context);
			},
			openDependency: async (path, supportedFilenames) => {
				const newSource = await source.openDependency(path, supportedFilenames);

				if (newSource == null) {
					throw new InvalidConfigurationError(
						`Cannot find configuration file ${JSON.stringify(path)}`,
					);
				}

				return this.createChildHandle(newSource, context);
			},
		};

		this.filename = source.basename;
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

	protected abstract createChildHandle(
		source: TextFileHandle,
		context: {updateReady?: Promise<void>},
	): AbstractKdlWorkspaceFileHandle;

	protected abstract parseWorkspace(document: Document): JsonObject;

	protected abstract serializeWorkspace(workspace: JsonObject): Document;

	protected abstract applyChangeToWorkspace(
		document: Document,
		expandedDocument: Document,
		allDocuments: readonly Document[],
		change: Change,
	): void;

	async read(): Promise<JsonObject> {
		const document = await this.readDocument();
		const expandedDocument = await expandDocument(document, this);

		return this.parseWorkspace(expandedDocument);
	}

	async update(
		updater: (value: JsonObject) => void | Promise<void>,
	): Promise<void> {
		if (this.#context.updateReady != null) {
			throw new Error('Configuration is already being updated');
		}

		let markReady: () => void;
		this.#context.updateReady = new Promise<void>((resolve) => {
			markReady = resolve;
		});

		const document = await this.readDocument();
		const allDocuments: Document[] = [];
		const expandedDocument = await expandDocument(document, this, allDocuments);

		const {value, close} = makeCombinedTracker(
			this.parseWorkspace(expandedDocument),
		).open();
		await updater(value);

		const changes = close();

		for (const change of changes) {
			this.applyChangeToWorkspace(
				document,
				expandedDocument,
				allDocuments,
				change,
			);
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
			formatHeader(header) + format(this.serializeWorkspace(value)),
		);
	}

	openRelative(path: string, supportedFilenames?: string[] | undefined) {
		return this.#context.openRelative(path, supportedFilenames);
	}

	openDependency(path: string, supportedFilenames?: string[] | undefined) {
		return this.#context.openDependency(path, supportedFilenames);
	}
}

async function expandDocument(
	document: Document,
	handle: AbstractKdlWorkspaceFileHandle,
	allDocuments?: Document[],
): Promise<Document> {
	allDocuments?.push(document);

	const imports = document.nodes.filter((node) => node.getTag() === 'import');
	if (imports.length === 0) {
		return document;
	}

	const replacements = new Map(
		await Promise.all(
			imports.map(async (importNode) => {
				const path = importNode.getName();
				// Node package names can't start with . and relative paths have to start
				// with . (./, ../, .\ and ..\)
				const importedHandle = path.startsWith('.')
					? await handle.openRelative(path)
					: await handle.openDependency(path);

				const importedDocument = await importedHandle.readDocument();

				return [
					importNode,
					await expandDocument(importedDocument, importedHandle, allDocuments),
				] as const;
			}),
		),
	);

	return new Document(
		document.nodes.flatMap((node) => replacements.get(node)?.nodes ?? node),
	);
}
