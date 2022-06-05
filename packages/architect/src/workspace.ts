import type {BuilderContext} from '@angular-devkit/architect';
import {
	type ConvertibleWorkspaceDefinition,
	readWorkspace,
} from '@snuggery/core';

export async function findWorkspace(
	context: BuilderContext,
): Promise<ConvertibleWorkspaceDefinition> {
	return await readWorkspace(context.workspaceRoot);
}
