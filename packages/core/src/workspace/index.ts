import type {UpstreamWorkspaceDefinition} from "../types";

import {
	createCombinedMiniWorkspaceHandle,
	createCombinedWorkspaceHandle,
	workspaceFilenames as combinedWorkspaceFilenames,
	workspaceFileExtensions as combinedWorkspaceFileExtensions,
} from "./combined";
import type {WorkspaceHost} from "./file";
import {findUp} from "./find-up";
import type {MiniWorkspaceOptions} from "./mini";
import {nodeFsHost} from "./node";
import {createSplitMiniWorkspaceHandle} from "./split/mini";
import {
	createSplitWorkspaceHandle,
	workspaceFilenames as splitWorkspaceFilenames,
	workspaceFileExtensions as splitWorkspaceFileExtensions,
} from "./split/workspace-handle";
import type {
	ConvertibleWorkspaceDefinition,
	WorkspaceDefinition,
} from "./types";

export type {WorkspaceHost} from "./file";
export {
	type JsonObject,
	type JsonPropertyName,
	type JsonPropertyPath,
	type JsonValue,
	isJsonArray,
	isJsonObject,
	getPrintableType,
	ConvertibleWorkspaceDefinition,
	type ProjectDefinition,
	ProjectDefinitionCollection,
	type TargetDefinition,
	TargetDefinitionCollection,
	type WorkspaceDefinition,
	InvalidConfigurationError,
} from "./types";

export const workspaceFilenames = [
	...combinedWorkspaceFilenames,
	...splitWorkspaceFilenames,
];

const workspaceExtensions = [
	...combinedWorkspaceFileExtensions,
	...splitWorkspaceFileExtensions,
];

export {nodeFsHost, type MiniWorkspaceOptions};

/**
 * Read the workspace configuration at the given path
 *
 * @param path Path to the workspace file or containing directory
 */
export async function readWorkspace(
	path: string,
	{host = nodeFsHost}: {host?: WorkspaceHost} = {},
): Promise<ConvertibleWorkspaceDefinition> {
	return await (
		(await createCombinedWorkspaceHandle(host, path)) ??
		(await createSplitWorkspaceHandle(host, path))
	).read();
}

/**
 * Find a workspace configuration for the given directory
 *
 * @param directory Directory to look for
 */
export async function findWorkspace(
	directory: string,
	{host = nodeFsHost}: {host?: WorkspaceHost} = {},
): Promise<{
	path: string;
	workspace(): Promise<ConvertibleWorkspaceDefinition>;
} | null> {
	const path = await findUp(workspaceFilenames, directory, {host});

	if (path == null) {
		return null;
	}

	return {
		path,
		workspace: () => readWorkspace(path, {host}),
	};
}

/**
 * Read the mini-workspace configuration at the given path
 *
 * @param path Path to the workspace file or containing directory
 */
export async function readMiniWorkspace(
	path: string,
	{host = nodeFsHost, ...opts}: MiniWorkspaceOptions & {host?: WorkspaceHost},
): Promise<ConvertibleWorkspaceDefinition> {
	return await (
		(await createCombinedMiniWorkspaceHandle(host, path, opts)) ??
		(await createSplitMiniWorkspaceHandle(host, path, opts))
	).read();
}

/**
 * Find a mini-workspace configuration for the given directory
 *
 * @param directory Directory to look for
 */
export async function findMiniWorkspace(
	directory: string,
	{
		host = nodeFsHost,
		basename,
		...opts
	}: MiniWorkspaceOptions & {host?: WorkspaceHost},
): Promise<{
	path: string;
	workspace(): Promise<ConvertibleWorkspaceDefinition>;
} | null> {
	const path = await findUp(
		Array.from(basename).flatMap((base) =>
			workspaceExtensions.map((ext) => `${base}${ext}`),
		),
		directory,
		{host},
	);

	if (path == null) {
		return null;
	}

	return {
		path,
		workspace: () => readMiniWorkspace(path, {host, basename, ...opts}),
	};
}

/**
 * Overwrite the workspace configuration in the given path
 *
 * Note the given path must already contain a workspace configuration file, though it may be empty.
 *
 * @param path Path to the workspace file or containing directory
 */
export async function writeWorkspace(
	path: string,
	workspace: WorkspaceDefinition | UpstreamWorkspaceDefinition,
	{
		host = nodeFsHost,
		header,
	}: {host?: WorkspaceHost; header?: string | string[]} = {},
): Promise<void> {
	await (
		(await createCombinedWorkspaceHandle(host, path)) ??
		(await createSplitWorkspaceHandle(host, path))
	).write(workspace, {header});
}

/**
 * Update the workspace configuration in the given path
 *
 * Changes made after the `updater` function returns (or its returned promise resolves) will not
 * be written to the configuration file.
 *
 * @param path Path to the workspace file or containing directory
 * @param updater Function that modifies the configuration
 */
export async function updateWorkspace(
	path: string,
	updater: (workspace: ConvertibleWorkspaceDefinition) => void | Promise<void>,
	{host = nodeFsHost}: {host?: WorkspaceHost} = {},
): Promise<void> {
	await (
		(await createCombinedWorkspaceHandle(host, path)) ??
		(await createSplitWorkspaceHandle(host, path))
	).update(updater);
}
