import {ArchitectCommand} from '../../command/architect';
import {formatMarkdownish} from '../../utils/format';

export class HelpTargetsCommand extends ArchitectCommand {
  static paths = [['help', 'targets']];

  static usage = ArchitectCommand.Usage({
    category: 'Workspace information commands',
    description: 'Show information about all available targets',
  });

  async execute(): Promise<void> {
    const printedTargets = new Set<string>();

    const {
      currentProject,
      defaultProject,
      uniqueTargets,
      workspace,
      report,
      format,
    } = this;

    report.reportInfo(
      'The following targets are available for execution without specifying a project.\n',
    );
    report.reportInfo(`  $ ${this.cli.binaryName} help target <target name>\n`);
    report.reportInfo('e.g.\n');
    report.reportInfo(`  $ ${this.cli.binaryName} help target build\n`);

    report.reportInfo(`${format.bold('Current project:')}\n`);

    if (currentProject == null) {
      report.reportInfo(
        'The current working directory is not inside a project.\n',
      );
    } else {
      const project = workspace.getProjectByName(currentProject);

      report.reportInfo(
        `The current project is \`${format.code(currentProject)}\`.`,
      );

      if (project.targets.size === 0) {
        report.reportInfo("It doesn't have any targets.");
      } else {
        report.reportInfo('It exposes the following targets:\n');

        for (const target of project.targets.keys()) {
          report.reportInfo(`- \`${format.code(target)}\``);
          printedTargets.add(target);
        }
      }

      report.reportSeparator();
    }

    report.reportInfo(`${format.bold('Default project:')}\n`);

    if (defaultProject == null) {
      report.reportInfo("There's no default project in this workspace.\n");
    } else {
      const project = workspace.tryGetProjectByName(defaultProject);

      if (project == null) {
        this.context.report.reportWarning(
          formatMarkdownish(
            `Couldn't find the configured default project \`${defaultProject}\` in the workspace.`,
            {format},
          ),
        );
        this.context.report.reportSeparator();
      } else {
        const availableTargets = Array.from(project.targets.keys()).filter(
          target => !printedTargets.has(target),
        );

        report.reportInfo(
          `The default project is \`${format.code(defaultProject)}\`.`,
        );

        if (project.targets.size === 0) {
          report.reportInfo("It doesn't have any targets.");
        } else if (availableTargets.length === 0) {
          report.reportInfo(
            formatMarkdownish(
              "All targets of this project are shadowed by the current project's targets.",
              {format},
            ),
          );
          report.reportSeparator();
        } else {
          report.reportInfo('It exposes the following targets:\n');

          for (const target of availableTargets) {
            report.reportInfo(`- \`${format.code(target)}\``);
            printedTargets.add(target);
          }

          if (availableTargets.length !== project.targets.size) {
            report.reportSeparator();
            report.reportInfo(
              `The current project shadows ${
                project.targets.size - availableTargets.length
              } targets of the default project`,
            );
          }
        }

        report.reportSeparator();
      }
    }

    report.reportInfo(`${format.bold('Unique targets:')}\n`);

    if (uniqueTargets.size === 0) {
      report.reportInfo('There are no unique targets in this workspace.\n');
    } else {
      const leftOverUniqueTargets = Array.from(uniqueTargets.keys()).filter(
        target => !printedTargets.has(target),
      );

      if (leftOverUniqueTargets.length === 0) {
        report.reportInfo(
          'All unique targets are part of the current project and/or default project.\n',
        );
      } else {
        report.reportInfo(
          'The following unique targets are available in the workspace:\n',
        );

        for (const target of leftOverUniqueTargets) {
          report.reportInfo(`- \`${format.code(target)}\``);
        }

        report.reportSeparator();

        if (leftOverUniqueTargets.length !== uniqueTargets.size) {
          report.reportInfo(
            'Some unique targets are part of the current project and/or default project.\n',
          );
        }
      }
    }
  }
}
