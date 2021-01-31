import type {BuilderContext} from '@angular-devkit/architect';
import {getProjectPath} from '@bgotink/atelier/builder-utils';
import {createRequire} from 'module';
import {dirname, join} from 'path';

interface Manifest {
  name: string;
  bin?: string | {[binary: string]: string};
}

function isPackage(name: string) {
  return /^(?:@[a-z0-9][\w.-]*\/)?[a-z0-9][\w.-]*$/.test(name);
}

function getUnscopedName(packageName: string) {
  return /^(?:@[a-z0-9][\w.-]*\/)?([a-z0-9][\w.-]*)(?:$|\/)/.exec(
    packageName,
  )![1]!;
}

/**
 * Resolve a binary from an installed node package
 *
 * @param packageName The name of the package containing the binary
 * @param binary Name of the binary as defined in the package
 * @param context Context of the builder
 */
export async function resolvePackageBin(
  packageName: string,
  binary: string | undefined,
  context: BuilderContext,
): Promise<{success: true; bin: string} | {success: false; error: string}> {
  if (!isPackage(packageName)) {
    return {
      success: false,
      error: `Invalid package name: "${packageName}"`,
    };
  }

  let manifestPath: string | undefined;

  for (const path of [await getProjectPath(context), context.workspaceRoot]) {
    const require = createRequire(join(path, '<synthetic>'));
    try {
      manifestPath = require.resolve(`${packageName}/package.json`);
      break;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'MODULE_NOT_FOUND') {
        throw e;
      }
    }
  }

  if (manifestPath == null) {
    return {
      success: false,
      error: `Couldn't find package ${packageName}`,
    };
  }

  const packageFolder = dirname(manifestPath);
  if (binary && /^\.?\//.test(binary)) {
    return {
      success: true,
      bin: join(packageFolder, binary),
    } as const;
  }

  const manifest = (await import(manifestPath)) as Manifest;

  if (!manifest.bin) {
    return {
      success: false,
      error: `Package ${packageName} doesn't expose any binarys`,
    };
  }

  let relativeBinaryPath: string;

  if (typeof manifest.bin === 'object') {
    const binaryName = binary ?? getUnscopedName(packageName);
    const _relativeBinaryPath = manifest.bin[binaryName];

    if (!_relativeBinaryPath) {
      return {
        success: false,
        error: `Package ${packageName} doesn't expose a binary named "${binaryName}"`,
      };
    }

    relativeBinaryPath = _relativeBinaryPath;
  } else {
    if (binary && binary !== getUnscopedName(packageName)) {
      return {
        success: false,
        error: `Package ${packageName} doesn't expose a binary named "${binary}"`,
      };
    }

    relativeBinaryPath = manifest.bin;
  }

  return {success: true, bin: join(packageFolder, relativeBinaryPath)};
}
