import {
	firstValueFrom,
	getProjectPath,
	resolveWorkspacePath,
} from '@snuggery/architect';
import type {BuilderContext} from '@snuggery/architect/create-builder';

import {exec} from './exec';
import {resolvePackageBin} from './resolve-package-bin';
import type {Schema, PackageBinarySchema} from './schema';

/**
 * Execute a binary, depending on config either globally installed or installed in a node package
 */
export async function execute(
	config: Schema,
	context: BuilderContext,
): Promise<void> {
	const cwd = config.cwd
		? resolveWorkspacePath(context, config.cwd)
		: await getProjectPath(context);

	let binary: string;

	if (!isPackageConfiguration(config)) {
		binary = config.binary;
	} else {
		binary = await resolvePackageBin(context, {
			packageName: config.package,
			binary: config.binary,
			resolveFrom: config.resolveFrom,
		});
	}

	await firstValueFrom(context, exec(cwd, binary, config));
}

function isPackageConfiguration(config: Schema): config is PackageBinarySchema {
	return 'package' in config && !!config.package;
}
