/* cspell:ignore kdljs */

import type {workspaces} from '@angular-devkit/core';

import type {TextFileHandle} from '../file';
import {
	InvalidConfigurationError,
	type WorkspaceHandle,
	type ConvertibleWorkspaceDefinition,
	type WorkspaceDefinition,
} from '../types';

export class SnuggeryKdlWorkspaceHandle implements WorkspaceHandle {
	readonly #fileHandle: TextFileHandle;

	constructor(fileHandle: TextFileHandle) {
		this.#fileHandle = fileHandle;
	}

	async #getHandle() {
		const [text, {parse, InvalidKdlError}] = await Promise.all([
			this.#fileHandle.read(),
			import('@bgotink/kdl'),
		]);

		let document;
		try {
			document = parse(text);
		} catch (e) {
			if (e instanceof InvalidKdlError) {
				throw new InvalidConfigurationError(e.message);
			}

			throw e;
		}

		const versionValues =
			document.nodes
				.find(node => node.name.name === 'version')
				?.entries.filter(entry => entry.name == null) || [];
		if (
			versionValues == null ||
			versionValues.length !== 1 ||
			typeof versionValues[0]!.value.value !== 'number'
		) {
			throw new InvalidConfigurationError(
				`Expected a version in the configuration file`,
			);
		}

		const version = versionValues[0]!.value.value as number;

		let HandleFactory;
		switch (version) {
			case 0:
				HandleFactory = (await import('./kdl/v0.js'))
					.SnuggeryKdlWorkspaceHandle;
				break;
			default:
				throw new InvalidConfigurationError(
					`Unexpected version ${version} in configuration, only 0 is supported`,
				);
		}

		return new HandleFactory(this.#fileHandle);
	}

	async read(): Promise<ConvertibleWorkspaceDefinition> {
		return await (await this.#getHandle()).read();
	}

	async write(
		value: workspaces.WorkspaceDefinition | WorkspaceDefinition,
		options: {header?: string | string[]},
	): Promise<void> {
		const HandleFactory = (await import('./kdl/v0.js'))
			.SnuggeryKdlWorkspaceHandle;

		const handle = new HandleFactory(this.#fileHandle);

		await handle.write(value, options);
	}

	async update(
		updater: (value: ConvertibleWorkspaceDefinition) => void | Promise<void>,
	): Promise<void> {
		await (await this.#getHandle()).update(updater);
	}
}
