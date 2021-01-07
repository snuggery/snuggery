import {UsageError} from 'clipanion';
import {join} from 'path';

import {AbstractCommand} from '../command/abstract-command';

export class ProjectCommand extends AbstractCommand {
  static usage = AbstractCommand.Usage({
    description: 'Run a command within a project',
    details: `
    This command runs another command as if atelier was executed from within that project.
    
    For architects this behaves as if a project is passed in the command. In other words, \`ai build app\` is the same as \`ai project app build\`. For schematics, this is the only way to run from another project.

    Note: This command doesn't change the working directory of the process.
    `,
    examples: [
      ['Run the `build` target in project `app`', '$0 project app build'],
      [
        'Run the `@schematics/angularcomponent` schematic in project `app`',
        '$0 project app generate @schematics/angular:component',
      ],
    ],
  });

  @AbstractCommand.String()
  public projectName!: string;

  @AbstractCommand.String()
  public command!: string;

  @AbstractCommand.Proxy()
  public args: string[] = [];

  @AbstractCommand.Path('project')
  execute(): Promise<number> {
    const project = this.workspace.tryGetProjectByName(this.projectName);

    if (project == null) {
      throw new UsageError(`Unknown project: "${project}"`);
    }

    const cwd = join(this.workspace.basePath, project.root);

    return this.cli.run([this.command, ...this.args], {startCwd: cwd});
  }
}