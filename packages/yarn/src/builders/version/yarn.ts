import {type BuilderContext, BuildFailureError} from '@snuggery/architect';

import {AppliedVersion, loadYarn, Yarn} from '../../utils/yarn';

export interface VersionBuilderOutput {
	appliedVersions: AppliedVersion[];
	yarn: Yarn;
}

const versionPluginName = '@yarnpkg/plugin-version';

export async function applyVersion(
	context: BuilderContext,
): Promise<VersionBuilderOutput> {
	const yarn = await loadYarn(context);
	const plugins = await yarn.listPlugins();

	if (!plugins.find(plugin => plugin.name === versionPluginName)) {
		throw new BuildFailureError(
			`Yarn plugin ${versionPluginName} is required for the @snuggery/yarn:version command but it wasn't found`,
		);
	}

	const appliedVersions = await yarn.applyVersion();

	context.logger.info('Version updates:');
	for (const {cwd, ident, oldVersion, newVersion} of appliedVersions) {
		if (cwd && newVersion && ident) {
			context.logger.info(
				`${ident.padEnd(20, ' ')} ${oldVersion.padEnd(
					10,
					' ',
				)} -> ${newVersion}`,
			);
		}
	}

	return {appliedVersions, yarn};
}
