import {BaseCommand} from '@yarnpkg/cli';
import {
	Configuration,
	FormatType,
	formatUtils,
	MessageName,
	Project,
	StreamReport,
	structUtils,
} from '@yarnpkg/core';
import {Filename, PortablePath, ppath, xfs} from '@yarnpkg/fslib';
import {
	npmConfigUtils,
	npmHttpUtils,
	npmPublishUtils,
} from '@yarnpkg/plugin-npm';
import {Option} from 'clipanion';

import {createPublishWorkspace, getManifestFromTarball} from '../../utils';

export class PublishCommand extends BaseCommand {
	static override paths = [['snuggery-workspace', 'publish']];

	tag = Option.String('--tag', 'latest');

	json = Option.Boolean('--json');

	async execute(): Promise<number> {
		const configuration = await Configuration.find(
			this.context.cwd,
			this.context.plugins,
		);

		const report = await StreamReport.start(
			{
				configuration,
				stdout: this.context.stdout,
				json: this.json,
				includeInfos: true,
			},
			async report => {
				const {project, workspace} = await Project.find(
					configuration,
					this.context.cwd,
				);

				if (!workspace) {
					report.reportError(MessageName.UNNAMED, "Couldn't find workspace");
					return;
				}

				if (
					workspace.manifest.name === null ||
					workspace.manifest.version === null
				) {
					report.reportError(
						MessageName.UNNAMED,
						'Workspaces must have valid names and versions to be published on an external registry',
					);
					return;
				}

				const ident = workspace.manifest.name;

				const tgz = ppath.join(
					project.cwd,
					'dist' as PortablePath,
					`${structUtils.slugifyIdent(ident)}.tgz` as Filename,
				);

				if (!(await xfs.existsPromise(tgz))) {
					report.reportError(
						MessageName.UNNAMED,
						`Pack package ${formatUtils.pretty(
							configuration,
							ident,
							FormatType.IDENT,
						)} first`,
					);
					return;
				}

				const tarballBuffer = await xfs.readFilePromise(tgz);
				const manifest = await getManifestFromTarball(tarballBuffer);

				if (
					manifest.name == null ||
					manifest.name.identHash !== ident.identHash
				) {
					report.reportError(
						MessageName.UNNAMED,
						`Tarball for package ${
							manifest.name &&
							formatUtils.pretty(configuration, manifest.name, FormatType.IDENT)
						} cannot be published in workspace for ${formatUtils.pretty(
							configuration,
							ident,
							FormatType.IDENT,
						)}`,
					);
					return;
				}

				const registry = npmConfigUtils.getPublishRegistry(manifest, {
					configuration,
				});

				const body = await npmPublishUtils.makePublishBody(
					createPublishWorkspace(workspace, workspace.cwd, manifest.raw),
					tarballBuffer,
					{
						access: undefined,
						tag: this.tag,
						registry,
					},
				);

				try {
					await npmHttpUtils.put(npmHttpUtils.getIdentUrl(ident), body, {
						configuration,
						registry,
						ident,
						jsonResponse: true,
					});
					// eslint-disable-next-line @typescript-eslint/no-explicit-any
				} catch (error: any) {
					if (error.name !== 'HTTPError') {
						throw error;
					} else {
						const message =
							error.response.body && error.response.body.error
								? error.response.body.error
								: `The remote server answered with HTTP ${error.response.statusCode} ${error.response.statusMessage}`;

						report.reportError(MessageName.NETWORK_ERROR, message);
					}
				}

				if (!report.hasErrors()) {
					report.reportInfo(
						null,
						`Published ${formatUtils.pretty(
							configuration,
							structUtils.makeDescriptor(ident, manifest.version!),
							FormatType.DESCRIPTOR,
						)}`,
					);
				}
			},
		);

		return report.exitCode();
	}
}
