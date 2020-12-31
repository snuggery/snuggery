import {Target} from '@angular-devkit/architect';
import {JsonObject} from '@angular-devkit/core';
import {UsageError} from 'clipanion';
import {ArchitectCommand} from '../command/architect';
import {parseFreeFormArguments, parseOptions} from '../utils/parse-options';

const reservedNames = new Set(['--configuration', '-c']);

export class EntryCommand extends ArchitectCommand {
  static usage = ArchitectCommand.Usage({
    category: 'Architect commands',
    description: 'Run a target in the current project',
    examples: [
      ['Run the `build` target in the current project', '$0 build'],
      [
        'Run the `build` target with the `production` configuration in the current project',
        '$0 build --configuration production',
      ],
    ],
  });

  @ArchitectCommand.String()
  public target?: string;

  @ArchitectCommand.Array('--configuration,-c', {
    description: 'Configuration(s) to use',
  })
  public configuration: string[] = [];

  @ArchitectCommand.Proxy()
  public args = [] as string[];

  @ArchitectCommand.Path()
  async execute() {
    if (!this.target) {
      this.context.stderr.write(this.cli.usage(null));
      return 1;
    }

    const {currentProject} = this;

    if (!currentProject) {
      throw new UsageError(`Couldn't find project to run "${this.target}" in`);
    }

    const project = this.workspace.tryGetProjectByName(currentProject);

    if (project == null) {
      throw new UsageError(`Couldn't find project "${currentProject}"`);
    }

    if (!project.targets.has(this.target)) {
      throw new UsageError(
        `Project "${currentProject}" doesn't have a target called "${this.target}"`,
      );
    }

    let target: Target;
    if (this.configuration.length > 0) {
      target = {
        project: currentProject,
        target: this.target,
        configuration: this.configuration.join(','),
      };
    } else {
      target = {
        project: currentProject,
        target: this.target,
      };
    }

    const {
      allowExtraOptions,
      options: definedOptions,
    } = await this.getOptionsForTarget(target);

    let options: JsonObject | undefined;
    if (definedOptions.length === 0) {
      if (allowExtraOptions) {
        options = parseFreeFormArguments(this.args);
      }
    } else {
      const o = parseOptions({
        allowExtraOptions,
        command: this,
        description: `Run the \`${target.target}\` target in the current project (\`${target.project}\`)`,
        options: definedOptions,
        path: [this.target],
        values: this.args,
        reservedNames,
      });

      if (o === null) {
        return 1;
      }

      options = o;
    }

    return this.runTarget({
      target,
      options,
    });
  }
}
