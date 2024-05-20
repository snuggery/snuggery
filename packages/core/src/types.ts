import type {workspaces} from "@angular-devkit/core";

import type * as self from "./workspace";

export type UpstreamWorkspaceDefinition = true extends typeof workspaces
	? self.WorkspaceDefinition
	: workspaces.WorkspaceDefinition;

export type UpstreamProjectDefinition = true extends typeof workspaces
	? self.ProjectDefinition
	: workspaces.ProjectDefinition;

export type UpstreamTargetDefinition = true extends typeof workspaces
	? self.TargetDefinition
	: workspaces.TargetDefinition;

export interface UpstreamTargetDefinitionCollection
	extends Iterable<readonly [string, UpstreamTargetDefinition]> {
	readonly size: number;

	add(
		definition: {
			name: string;
		} & UpstreamTargetDefinition,
	): UpstreamTargetDefinition;
	set(name: string, value: UpstreamTargetDefinition): this;
}

export interface UpstreamProjectDefinitionCollection
	extends Iterable<readonly [string, UpstreamProjectDefinition]> {
	readonly size: number;

	add(definition: {
		name: string;
		root: string;
		sourceRoot?: string;
		prefix?: string;
		targets?: Record<string, UpstreamTargetDefinition | undefined>;
		[key: string]: unknown;
	}): UpstreamProjectDefinition;
	set(name: string, value: UpstreamProjectDefinition): this;
}
