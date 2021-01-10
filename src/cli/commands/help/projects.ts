import {isJsonObject} from '@angular-devkit/core';

import {AbstractCommand} from '../../command/abstract-command';

export class HelpProjectsCommand extends AbstractCommand {
  static usage = AbstractCommand.Usage({
    category: 'Workspace information commands',
    description: 'Show information about all projects',
  });

  @AbstractCommand.Path('help', 'projects')
  async execute(): Promise<void> {
    const {workspace, report} = this.context;

    if (workspace == null) {
      report.reportInfo('No workspace configuration found.\n');
      return;
    }

    const {
      projects,
      extensions: {cli},
    } = workspace;
    const {currentProject, format} = this;

    let defaultProject: string | null = null;
    if (isJsonObject(cli!) && typeof cli.defaultProject === 'string') {
      ({defaultProject} = cli);
    }

    report.reportInfo(
      'The current workspace contains the following projects:\n',
    );

    for (const [projectName, {root, extensions}] of projects) {
      report.reportInfo(
        `- \`${format.code(projectName)}\`: a \`${format.code(
          typeof extensions.projectType === 'string'
            ? extensions.projectType
            : 'library',
        )}\` project at \`${format.code(root)}\``,
      );

      switch (projectName) {
        case currentProject:
          report.reportInfo(
            `  This is the current project based on the working directory`,
          );
          break;
        case defaultProject:
          report.reportInfo(`  This is the default project`);
          break;
      }
    }

    report.reportSeparator();
    report.reportInfo('For more information about a project, run\n');
    report.reportInfo(`  ${this.cli.binaryName} help project <project name>\n`);
  }
}
