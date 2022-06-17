import {Change, makeCombinedTracker} from '../../proxy';
import type {JsonObject} from '../../types';

import type {FileHandle, FileHandleContext} from './types';

export abstract class AbstractFileHandle<Document> implements FileHandle {
	#context: FileHandleContext;

	readonly filename: string;

	constructor(context: FileHandleContext) {
		this.#context = context;

		this.filename = context.source.basename;
	}

	abstract parse(content: string): Document | Promise<Document>;

	abstract getValue(document: Document): JsonObject | Promise<JsonObject>;

	abstract stringify(value: JsonObject): string | Promise<string>;

	abstract createHeader(header: string | string[]): string;

	abstract applyChanges(
		source: string,
		document: Document,
		changes: readonly Change[],
	): string | Promise<string>;

	async read(): Promise<JsonObject> {
		const {updateReady} = this.#context;
		if (updateReady != null) {
			/* eslint-disable-next-line no-async-promise-executor */
			return new Promise(async resolve => {
				const source = await this.#context.source.read();
				const document = await this.parse(source);

				const changes = await makeCombinedTracker(
					await this.getValue(document),
				).open(async value => {
					resolve(value);
					await updateReady;
				});

				await this.#context.source.write(
					await this.applyChanges(source, document, changes),
				);
			});
		}

		return this.getValue(await this.parse(await this.#context.source.read()));
	}

	async write(
		value: JsonObject,
		{header}: {header?: string | string[]},
	): Promise<void> {
		await this.#context.source.write(
			(header ? this.createHeader(header) : '') + (await this.stringify(value)),
		);
	}

	async update(
		updater: (value: JsonObject) => void | Promise<void>,
	): Promise<void> {
		if (this.#context.updateReady != null) {
			throw new Error('Configuration is already being updated');
		}

		const updatePromise = (async () => {
			const source = await this.#context.source.read();
			const document = await this.parse(source);

			const changes = await makeCombinedTracker(
				await this.getValue(document),
			).open(updater);

			await this.#context.source.write(
				await this.applyChanges(source, document, changes),
			);
		})();

		this.#context.updateReady = updatePromise;

		await updatePromise;

		this.#context.updateReady = undefined;
	}

	readRelative(
		path: string,
		supportedFilenames?: string[],
	): Promise<FileHandle> {
		return this.#context.createFileHandle(path, supportedFilenames);
	}
}
