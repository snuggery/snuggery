/* cspell:ignore kdljs */

import type {workspaces} from '@angular-devkit/core';
import type {ParseResult} from 'kdljs';

import type {TextFileHandle} from '../file';
import {
	InvalidConfigurationError,
	UnsupportedOperationError,
	type WorkspaceHandle,
	type ConvertibleWorkspaceDefinition,
	type WorkspaceDefinition,
} from '../types';

function processParseErrors(errors: ParseResult['errors']) {
	if (errors.length === 1) {
		const [error] = errors as [ParseResult['errors'][number]];
		throw new InvalidConfigurationError(
			`Error while parsing KDL file: ${error.message} at ${error.token.startLine}:${error.token.startColumn}`,
		);
	} else if (errors.length > 0) {
		throw new InvalidConfigurationError(
			`Errors while parsing KDL file:\n- ${errors
				.map(
					error =>
						`${error.message} at ${error.token.startLine}:${error.token.startColumn}`,
				)
				.join('\n- ')}`,
		);
	}
}

export class SnuggeryKdlWorkspaceHandle implements WorkspaceHandle {
	readonly #fileHandle: TextFileHandle;

	constructor(fileHandle: TextFileHandle) {
		this.#fileHandle = fileHandle;
	}

	async read(): Promise<ConvertibleWorkspaceDefinition> {
		const [text, {parse}] = await Promise.all([
			this.#fileHandle.read(),
			import('kdljs'),
		]);

		const {errors, output: document = []} = parse(text);

		processParseErrors(errors);

		const versionNode = document.find(node => node.name === 'version');
		if (
			versionNode == null ||
			versionNode.values.length !== 1 ||
			typeof versionNode.values[0] !== 'number'
		) {
			throw new InvalidConfigurationError(
				`Expected a version in the configuration file`,
			);
		}

		const version = versionNode.values[0];

		switch (version) {
			case 0:
				return (
					await import('./kdl/v0.js')
				).SnuggeryWorkspaceDefinition.fromConfiguration(document);
			default:
				throw new InvalidConfigurationError(
					`Unexpected version ${version} in configuration, only 0 is supported`,
				);
		}
	}

	async write(
		value: workspaces.WorkspaceDefinition | WorkspaceDefinition,
	): Promise<void> {
		const [{SnuggeryWorkspaceDefinition}, {format}] = await Promise.all([
			import('./kdl/v0.js'),
			import('kdljs'),
		]);

		const {document} = SnuggeryWorkspaceDefinition.fromValue(value);

		await this.#fileHandle.write(
			format(document, {
				printEmptyChildren: false,
				printNullProps: false,
			}),
		);
	}

	async update(): Promise<never> {
		throw new UnsupportedOperationError(
			`Updating KDL workspace configuration files is not supported yet`,
		);
	}
}
