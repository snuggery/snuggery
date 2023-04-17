import {
	type BuilderContext,
	BuildFailureError,
	getProjectPath,
	resolveWorkspacePath,
} from '@snuggery/architect';
import {createRequire} from 'node:module';
import {dirname, join} from 'node:path';

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
	context: BuilderContext,
	{
		packageName,
		resolveFrom,
		binary,
	}: {
		packageName: string;
		resolveFrom: string | string[] | undefined;
		binary: string | undefined;
	},
): Promise<string> {
	if (!isPackage(packageName)) {
		throw new BuildFailureError(`Invalid package name: "${packageName}"`);
	}

	if (resolveFrom == null) {
		resolveFrom = [await getProjectPath(context), context.workspaceRoot];
	} else if (typeof resolveFrom === 'string') {
		resolveFrom = [resolveWorkspacePath(context, resolveFrom)];
	} else {
		resolveFrom = resolveFrom.map(path => resolveWorkspacePath(context, path));
	}

	let manifestPath: string | undefined;

	for (const path of resolveFrom) {
		const require = createRequire(join(path, '<synthetic>'));
		try {
			manifestPath = require.resolve(`${packageName}/package.json`);
			break;
		} catch (e) {
			if ((e as NodeJS.ErrnoException).code !== 'MODULE_NOT_FOUND') {
				// Maybe the package doesn't have ./package.json in its exports...
				// Try to work around that by resolving the package itself and looking for the package
				// folder
				try {
					const main = require.resolve(packageName);
					const maybePackageFolder = main.slice(
						0,
						main.search(`[/\\\\]node_modules[/\\\\]${packageName}[/\\\\]`),
					);

					manifestPath = require.resolve(
						`${maybePackageFolder}/node_modules/${packageName}/package.json`,
					);
				} catch {
					throw e;
				}
			}
		}
	}

	if (manifestPath == null) {
		throw new BuildFailureError(`Couldn't find package ${packageName}`);
	}

	const packageFolder = dirname(manifestPath);
	if (binary && /^\.?\//.test(binary)) {
		return join(packageFolder, binary);
	}

	const manifest = require(manifestPath) as Manifest;

	if (!manifest.bin) {
		throw new BuildFailureError(
			`Package ${packageName} doesn't expose any binaries`,
		);
	}

	let relativeBinaryPath: string;

	if (typeof manifest.bin === 'object') {
		const binaryName = binary ?? getUnscopedName(packageName);
		const _relativeBinaryPath = manifest.bin[binaryName];

		if (!_relativeBinaryPath) {
			throw new BuildFailureError(
				`Package ${packageName} doesn't expose a binary named "${binaryName}"`,
			);
		}

		relativeBinaryPath = _relativeBinaryPath;
	} else {
		if (binary && binary !== getUnscopedName(packageName)) {
			throw new BuildFailureError(
				`Package ${packageName} doesn't expose a binary named "${binary}"`,
			);
		}

		relativeBinaryPath = manifest.bin;
	}

	return join(packageFolder, relativeBinaryPath);
}
