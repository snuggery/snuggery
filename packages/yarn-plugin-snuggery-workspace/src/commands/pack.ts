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

import {createPublishWorkspace} from '../utils';

export class PackCommand extends BaseCommand {
  json = false;

  directory!: string;

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
            `Package at ${workspace.relativeCwd} doesn't have a name`,
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
            `Build package ${structUtils.prettyIdent(
              configuration,
              workspace.manifest.name,
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
            `Invalid distribution folder: found package ${structUtils.prettyIdent(
              configuration,
              ident,
            )} but expected ${structUtils.prettyIdent(
              configuration,
              workspace.anchoredDescriptor,
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
          `Packed ${structUtils.prettyIdent(
            configuration,
            ident,
          )} into ${formatUtils.pretty(
            configuration,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            target as any,
            FormatType.PATH,
          )}`,
        );
      },
    );

    return report.exitCode();
  }
}

PackCommand.addPath('snuggery-workspace', 'pack');
PackCommand.addOption('json', PackCommand.Boolean('--json'));
PackCommand.addOption('directory', PackCommand.String({required: true}));
