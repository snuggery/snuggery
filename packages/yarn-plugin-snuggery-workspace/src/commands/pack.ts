import {BaseCommand} from '@yarnpkg/cli';
import {
  Configuration,
  FormatType,
  formatUtils,
  MessageName,
  miscUtils,
  Project,
  StreamReport,
  structUtils,
} from '@yarnpkg/core';
import {Filename, npath, ppath, xfs} from '@yarnpkg/fslib';
import {packUtils} from '@yarnpkg/plugin-pack';
import {Option} from 'clipanion';

import {createPublishWorkspace} from '../utils';

export class PackCommand extends BaseCommand {
  static paths = [['snuggery-workspace', 'pack']];

  json = Option.Boolean('--json');

  directory = Option.String({required: true});

  async execute(): Promise<number> {
    const configuration = await Configuration.find(
      this.context.cwd,
      this.context.plugins,
    );

    const report = await StreamReport.start(
      {
        configuration,
        stdout: this.context.stdout,
        includeFooter: false,
        includeInfos: true,
        json: this.json,
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

        if (workspace.manifest.name == null) {
          report.reportError(
            MessageName.UNNAMED,
            `Package at ${formatUtils.pretty(
              configuration,
              workspace.relativeCwd,
              FormatType.PATH,
            )} doesn't have a name`,
          );
          return;
        }

        const dist = ppath.join(project.cwd, 'dist' as Filename);
        await xfs.mkdirPromise(dist, {recursive: true});

        await project.restoreInstallState();

        const target = ppath.join(
          dist,
          `${structUtils.slugifyIdent(
            workspace.manifest.name,
          )}.tgz` as Filename,
        );
        const source = ppath.resolve(
          workspace.cwd,
          npath.toPortablePath(this.directory),
        );

        if (!(await xfs.existsPromise(source))) {
          report.reportError(
            MessageName.UNNAMED,
            `Build package ${formatUtils.pretty(
              configuration,
              workspace.manifest.name,
              FormatType.IDENT,
            )} first`,
          );
          return;
        }

        const rawManifest = await xfs.readJsonPromise(
          ppath.join(source, Filename.manifest),
        );
        const ident = structUtils.parseIdent(rawManifest.name);

        if (ident.identHash !== workspace.anchoredDescriptor.identHash) {
          report.reportError(
            MessageName.UNNAMED,
            `Invalid distribution folder: found package ${formatUtils.pretty(
              configuration,
              ident,
              FormatType.IDENT,
            )} but expected ${formatUtils.pretty(
              configuration,
              workspace.anchoredDescriptor,
              FormatType.IDENT,
            )}`,
          );
          return;
        }

        const publishWorkspace = createPublishWorkspace(
          workspace,
          source,
          rawManifest,
        );

        const pack = await packUtils.genPackStream(
          publishWorkspace,
          await packUtils.genPackList(publishWorkspace),
        );

        await xfs.writeFilePromise(target, await miscUtils.bufferStream(pack));

        report.reportInfo(
          null,
          `Packed ${formatUtils.pretty(
            configuration,
            ident,
            FormatType.IDENT,
          )} into ${formatUtils.pretty(
            configuration,
            target,
            FormatType.PATH,
          )}`,
        );
      },
    );

    return report.exitCode();
  }
}
