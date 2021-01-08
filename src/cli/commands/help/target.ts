import {bold, cyanBright} from 'chalk';
import {UsageError} from 'clipanion';

import {UnknownTargetError} from '../../architect/host';
import {ArchitectCommand} from '../../command/architect';

const unsafeTargetNames: ReadonlySet<string> = new Set([
  'generate',
  'help',
  'project',
  'run',
]);

export class HelpTargetCommand extends ArchitectCommand {
  static usage = ArchitectCommand.Usage({
    description: 'Show information about a target',
    examples: [
      [
        'Print information about `build` in the current project',
        '$0 help target build',
      ],
      [
        'Print information about `test` in the `app` project',
        '$0 help target test app',
      ],
    ],
  });

  @ArchitectCommand.String()
  target!: string;

  @ArchitectCommand.String({required: false})
  project?: string;

  @ArchitectCommand.Path('help', 'target')
  async execute(): Promise<number> {
    if (this.project != null) {
      await this.executeWithProject(this.project);
    } else {
      await this.executeWithoutProject();
    }

    return 0;
  }

  private async executeWithProject(projectName: string, projectLabel?: string) {
    const target = this.workspace
      .getProjectByName(projectName)
      .targets.get(this.target);

    if (target == null) {
      throw new UnknownTargetError(
        `Project ${JSON.stringify(
          projectName,
        )} doesn't have a target named ${JSON.stringify(this.target)}`,
      );
    }

    this.context.stdout.write(
      `Run target \`${cyanBright(this.target)}\` in project \`${cyanBright(
        projectName,
      )}\`${projectLabel ? ` ${projectLabel}` : ''} via:\n\n`,
    );
    if (unsafeTargetNames.has(this.target)) {
      const spec =
        this.project != null ? `${this.project}:${this.target}` : this.target;
      this.context.stdout.write(
        `  $ ${this.cli.binaryName} run target ${spec}\n\n`,
      );
    } else if (this.project != null) {
      this.context.stdout.write(
        `  $ ${this.cli.binaryName} ${this.target} ${this.project}\n\n`,
      );
    } else {
      this.context.stdout.write(
        `  $ ${this.cli.binaryName} ${this.target}\n\n`,
      );
    }

    this.context.stdout.write(
      `Add \`${cyanBright(
        '--help',
      )}\` to that command to see the available options.\n\n`,
    );

    const configurations = Object.keys(target.configurations ?? {});
    if (configurations.length > 0) {
      this.context.stdout.write(`${bold('Configurations')}\n\n`);

      for (const config of configurations) {
        this.context.stdout.write(`- ${config}\n`);
      }

      this.context.stdout.write(`\n`);
    }

    this.printProjectList();
  }

  private async executeWithoutProject() {
    const project = this.tryToFindProject();

    if (project != null) {
      return this.executeWithProject(...project);
    }

    this.printProjectList();
  }

  private tryToFindProject(): [project: string, label: string] | null {
    const {workspace, currentProject} = this;

    if (currentProject != null) {
      const project = workspace.getProjectByName(currentProject);
      if (project.targets.has(this.target)) {
        return [currentProject, `(based on current working directory)`];
      }
    }

    const {defaultProject} = this;

    if (typeof defaultProject === 'string') {
      const project = workspace.tryGetProjectByName(defaultProject);

      if (project == null) {
        this.context.report.reportWarning(
          `Couldn't find configured default project ${JSON.stringify(
            defaultProject,
          )} in the workspace`,
        );
      } else if (project.targets.has(this.target)) {
        return [defaultProject, `(default project)`];
      }
    }

    const projectsWithTarget = Array.from(workspace.projects)
      .filter(([, {targets}]) => targets.has(this.target))
      .map(([project]) => project);

    if (projectsWithTarget.length === 1) {
      return [projectsWithTarget[0]!, `(only project with this target)`];
    }

    return null;
  }

  private printProjectList() {
    const projects = Array.from(this.workspace.projects)
      .filter(([, {targets}]) => targets.has(this.target))
      .map(([project]) => project);

    if (projects.length === 0) {
      throw new UsageError(
        `Target ${JSON.stringify(
          this.target,
        )} is not configured in any project of this workspace`,
      );
    }

    const {currentProject, defaultProject, project: selectedProject} = this;

    this.context.stdout.write(`${bold('Projects:')}\n\n`);

    this.context.stdout.write(
      `Target \`${cyanBright(
        this.target,
      )}\` is available in the following projects:\n\n`,
    );
    for (const project of projects) {
      let label = '';
      switch (project) {
        case currentProject:
          label = ' (project in current working directory)';
          break;
        case defaultProject:
          label = ' (default project)';
          break;
        case selectedProject:
          label = ' (selected project)';
          break;
      }

      this.context.stdout.write(`- \`${cyanBright(project)}\`${label}\n`);
    }
  }
}
