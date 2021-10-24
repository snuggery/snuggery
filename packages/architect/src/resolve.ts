import type {BuilderContext} from '@angular-devkit/architect';
import {relative, resolve} from 'path';

/**
 * Resolve the given path relative to the workspace root
 *
 * @param ctx The builder context
 * @param path The relative path to resolve
 */
export function resolveWorkspacePath(ctx: BuilderContext, path: string): string;
/**
 * Resolve the given path relative to the workspace root
 *
 * @param ctx The builder context
 * @param path The relative path to resolve
 * @returns undefined if the given path was undefined
 */
export function resolveWorkspacePath(
	ctx: BuilderContext,
	path: string | undefined,
): string | undefined;
export function resolveWorkspacePath(
	ctx: BuilderContext,
	path: string | undefined,
): string | undefined {
	return path != null ? resolve(ctx.workspaceRoot, path) : undefined;
}

/**
 * Returns the path relative to the workspace root
 *
 * @param ctx The builder context
 * @param path The absolute path
 */
export function relativeWorkspacePath(
	ctx: BuilderContext,
	path: string,
): string {
	return relative(ctx.workspaceRoot, path);
}

/**
 * Resolve a path relative to the project's root
 *
 * This function requires the builder context to have a target.
 *
 * @param ctx The builder context
 * @param path The relative path to resolve
 */
export async function resolveProjectPath(
	ctx: BuilderContext,
	path: string,
): Promise<string>;
/**
 * Resolve a path relative to the project's root
 *
 * This function requires the builder context to have a target.
 *
 * @param ctx The builder context
 * @param path The relative path to resolve
 * @returns undefined if the given path was undefined
 */
export async function resolveProjectPath(
	ctx: BuilderContext,
	path: string | undefined,
): Promise<string | undefined>;
export async function resolveProjectPath(
	ctx: BuilderContext,
	path: string | undefined,
): Promise<string | undefined> {
	return path ? resolve(await getProjectPath(ctx), path) : undefined;
}

/**
 * Returns the absolute path of the project's folder.
 *
 * This function requires the builder context to have a target.
 *
 * @param ctx The builder context
 */
export async function getProjectPath(ctx: BuilderContext): Promise<string> {
	if (ctx.target == null) {
		throw new Error(
			`Cannot auto-discover project-local files when calling a builder with scheduleBuilder`,
		);
	}

	const {root} = await ctx.getProjectMetadata(ctx.target.project);
	return resolveWorkspacePath(ctx, root as string);
}
