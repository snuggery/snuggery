import type {BuilderContext, BuilderOutput} from '@angular-devkit/architect';
import {copy} from 'fs-extra';
import {glob as _glob, IOptions} from 'glob';
import {join} from 'path';
import {promisify} from 'util';

import {getProjectPath, resolveWorkspacePath} from './resolve';

const glob = promisify(_glob);

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
}

export async function copyAssets(
  context: BuilderContext,
  outputFolder: string,
  assets: AssetSpec[],
): Promise<BuilderOutput> {
  for (const [i, asset] of assets.entries()) {
    const from = asset.from
      ? resolveWorkspacePath(context, asset.from)
      : await getProjectPath(context);
    const to = asset.to ? join(outputFolder, asset.to) : outputFolder;

    let files;
    try {
      files = await resolveGlobs(context, from, asset);
    } catch (e) {
      return {
        success: false,
        error: `Failed to match pattern in asset ${i}: ${
          e instanceof Error ? e.message : e
        }`,
      };
    }

    try {
      for (const relativeFile of files) {
        await copy(join(from, relativeFile), join(to, relativeFile), {
          errorOnExist: false,
          recursive: true,
        });
      }
    } catch (e) {
      return {
        success: false,
        error: `Failed to copy asset ${i}: ${
          e instanceof Error ? e.message : e
        }`,
      };
    }
  }

  return {
    success: true,
  };
}

const cache: IOptions['cache'] = {};

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
        include.map(pattern =>
          glob(pattern, {
            cache,
            cwd,
            ignore: asset.exclude,
            root: context.workspaceRoot,
          }),
        ),
      )
    ).flat(),
  );
}
