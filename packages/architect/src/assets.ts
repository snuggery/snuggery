import {join} from 'node:path';

import {type BuilderContext, BuildFailureError} from './create-builder';
import {getProjectPath, resolveWorkspacePath} from './resolve';

export interface AssetSpec {
	/**
	 * Globs to include in the asset, relative to `from`
	 */
	include: string | string[];

	/**
	 * Globs to exclude, relative to `from`
	 */
	exclude?: string | string[];

	/**
	 * The path to include the assets from, defaults to the root of the active project
	 */
	from?: string;

	/**
	 * The path to write the assets to, defaults to the folder the package is being built into
	 */
	to?: string;

	/**
	 * Return a successful result if no matching files were found
	 */
	allowEmpty?: boolean;
}

export async function copyAssets(
	context: BuilderContext,
	outputFolder: string,
	assets: string | string[] | AssetSpec[],
): Promise<void> {
	const {copy} = await import('fs-extra');
	const {glob} = await import('glob');

	if (typeof assets === 'string') {
		assets = [assets];
	}

	for (const [i, rawAsset] of assets.entries()) {
		const asset: AssetSpec =
			typeof rawAsset === 'string' ? {include: rawAsset} : rawAsset;

		const from = asset.from
			? resolveWorkspacePath(context, asset.from)
			: await getProjectPath(context);
		const to = asset.to ? join(outputFolder, asset.to) : outputFolder;

		let files;
		try {
			files = await resolveGlobs(context, from, asset);
		} catch (e) {
			throw new BuildFailureError(
				`Failed to match pattern in asset ${i}: ${
					e instanceof Error ? e.message : e
				}`,
			);
		}

		if (files.size === 0 && !asset.allowEmpty) {
			throw new BuildFailureError(
				`Failed to match any assets for ${JSON.stringify(rawAsset)}`,
			);
		}

		try {
			for (const relativeFile of files) {
				await copy(join(from, relativeFile), join(to, relativeFile), {
					errorOnExist: false,
				});
			}
		} catch (e) {
			throw new BuildFailureError(
				`Failed to copy asset ${i}: ${e instanceof Error ? e.message : e}`,
			);
		}
	}

	async function resolveGlobs(
		context: BuilderContext,
		cwd: string,
		asset: AssetSpec,
	): Promise<Set<string>> {
		const include = Array.isArray(asset.include)
			? asset.include
			: [asset.include];

		return new Set(
			(
				await Promise.all(
					include.map((pattern) =>
						glob(pattern, {
							cwd,
							ignore: asset.exclude,
							root: context.workspaceRoot,
						}),
					),
				)
			).flat(),
		);
	}
}
