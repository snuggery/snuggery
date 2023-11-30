import {
	type ConvertibleWorkspaceDefinition,
	readWorkspace,
} from "@snuggery/core";

import type {BuilderContext} from "./create-builder";

export async function findWorkspace(
	context: BuilderContext,
): Promise<ConvertibleWorkspaceDefinition> {
	return await readWorkspace(context.workspaceRoot);
}
