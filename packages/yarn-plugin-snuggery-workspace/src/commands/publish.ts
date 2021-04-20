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

import {createPublishWorkspace, getManifestFromTarball} from '../utils';

export class PublishCommand extends BaseCommand {
  tag = 'latest';

  json = false;

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
            `Pack package ${structUtils.prettyIdent(
              configuration,
              ident,
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
              structUtils.prettyIdent(configuration, manifest.name)
            } cannot be published in workspace for ${structUtils.prettyIdent(
              configuration,
              ident,
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
        } catch (error) {
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
            MessageName.UNNAMED,
            `Published ${formatUtils.pretty(
              configuration,
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              structUtils.makeDescriptor(ident, manifest.version!) as any,
              FormatType.DESCRIPTOR,
            )}`,
          );
        }
      },
    );

    return report.exitCode();
  }
}

PublishCommand.addPath('snuggery-workspace', 'publish');
PublishCommand.addOption('tag', PublishCommand.String(`--tag`));
PublishCommand.addOption('json', PublishCommand.Boolean(`--json`));
