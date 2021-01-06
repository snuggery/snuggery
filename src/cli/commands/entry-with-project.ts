import type {Target} from '@angular-devkit/architect';
import {isJsonArray, JsonObject} from '@angular-devkit/core';
import {UsageError} from 'clipanion';
import {ArchitectCommand, configurationOption} from '../command/architect';
import {parseFreeFormArguments, parseOptions} from '../utils/parse-options';

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
  async execute(): Promise<number> {
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

    const target: Target = {
      project: this.project,
      target: this.target,
    };
    const configurations = new Set(this.configuration);

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
        command: this,
        description: `Run the \`${target.target}\` target in the \`${target.project}\` project`,
        options: [configurationOption, ...definedOptions],
        path: [this.target],
        values: this.args,
      });

      if (o === null) {
        return 1;
      }

      options = o;
    }

    if (options != null && isJsonArray(options.configuration!)) {
      for (const value of options.configuration) {
        if (typeof value === 'string') {
          configurations.add(value);
        }
      }
      delete options.configuration;
    }

    if (configurations.size > 0) {
      target.configuration = Array.from(configurations).join(',');
    }

    return this.runTarget({
      target,
      options,
    });
  }
}
