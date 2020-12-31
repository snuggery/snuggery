import {JsonObject} from '@angular-devkit/core';
import {UsageError} from 'clipanion';
import {ArchitectCommand} from '../command/architect';
import {parseFreeFormArguments, parseOptions} from '../utils/parse-options';

const reservedNames = new Set(['--configuration', '-c']);

export class EntryWithProjectCommand extends ArchitectCommand {
  static usage = ArchitectCommand.Usage({
    category: 'Architect commands',
    description: 'Run a target in a project',
    examples: [
      [
        'Run the `build` target in the `application` project',
        '$0 build application',
      ],
      [
        'Run the `build` target with the `production` configuration in the `application` project',
        '$0 build application --configuration production',
      ],
    ],
  });

  @ArchitectCommand.String()
  public target?: string;

  @ArchitectCommand.String()
  public project?: string;

  @ArchitectCommand.Array('--configuration,-c', {
    description: 'Configuration(s) to use',
  })
  public configuration: string[] = [];

  @ArchitectCommand.Proxy()
  public args = [] as string[];

  @ArchitectCommand.Path()
  async execute() {
    if (!this.target || !this.project) {
      this.context.stderr.write(this.cli.usage(null));
      return 1;
    }

    const project = this.workspace.tryGetProjectByName(this.project);

    if (project == null) {
      throw new UsageError(`Couldn't find project "${this.project}"`);
    }

    if (!project.targets.has(this.target)) {
      throw new UsageError(
        `Project "${this.project}" doesn't have a target called "${this.target}"`,
      );
    }

    let target;
    if (this.configuration.length > 0) {
      target = {
        project: this.project,
        target: this.target,
        configuration: this.configuration.join(','),
      };
    } else {
      target = {
        project: this.project,
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
        description: `Run the \`${target.target}\` target in the \`${target.project}\` project`,
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
