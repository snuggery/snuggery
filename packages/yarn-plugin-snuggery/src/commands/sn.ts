import {BaseCommand} from '@yarnpkg/cli';
import {Configuration, Project, scriptUtils, structUtils} from '@yarnpkg/core';

const snuggeryIdentHash = structUtils.makeIdent('snuggery', 'snuggery')
  .identHash;

export class SnCommand extends BaseCommand {
  public args: string[] = [];

  async execute(): Promise<number | void> {
    const configuration = await Configuration.find(
      this.context.cwd,
      this.context.plugins,
    );
    const {project, workspace: activeWorkspace} = await Project.find(
      configuration,
      this.context.cwd,
    );

    await project.restoreInstallState();

    const workspacesToLook = [project.topLevelWorkspace];

    if (activeWorkspace != null) {
      workspacesToLook.unshift(activeWorkspace);
    }

    for (const [i, workspace] of workspacesToLook.entries()) {
      if (!workspace.dependencies.has(snuggeryIdentHash)) {
        continue;
      }

      if (i === 0 && scriptUtils.hasWorkspaceScript(workspace, 'sn')) {
        break;
      }

      return await scriptUtils.executePackageAccessibleBinary(
        workspace.anchoredLocator,
        'sn',
        this.args,
        {
          cwd: this.context.cwd,
          project,
          stdin: this.context.stdin,
          stdout: this.context.stdout,
          stderr: this.context.stderr,
        },
      );
    }

    return this.cli.run(['run', 'sn', ...this.args]);
  }
}

SnCommand.addOption('args', BaseCommand.Proxy());
SnCommand.addPath('sn');
