import {Architect, Target} from '@angular-devkit/architect';
import {WorkspaceNodeModulesArchitectHost} from '@angular-devkit/architect/node';
import {json, JsonObject} from '@angular-devkit/core';

import {Cached} from '../utils/decorator';
import {parseSchema} from '../utils/parse-schema';
import {AbstractCommand} from './abstract-command';

export abstract class ArchitectCommand extends AbstractCommand {
  @Cached()
  protected get registry(): json.schema.SchemaRegistry {
    const registry = new json.schema.CoreSchemaRegistry();
    registry.addPostTransform(json.schema.transforms.addUndefinedDefaults);
    registry.useXDeprecatedProvider(msg => this.context.stderr.write(msg)); // TODO logging

    return registry;
  }

  @Cached()
  protected get architectHost(): WorkspaceNodeModulesArchitectHost {
    return new WorkspaceNodeModulesArchitectHost(
      this.workspace,
      this.workspace.basePath,
    );
  }

  @Cached()
  protected get architect(): Architect {
    return new Architect(this.architectHost, this.registry);
  }

  protected async getOptionsForTarget(target: Target) {
    return this.getOptionsForBuilder(
      await this.architectHost.getBuilderNameForTarget(target),
    );
  }

  protected async getOptionsForBuilder(builderConf: string) {
    const builderDesc = await this.architectHost.resolveBuilder(builderConf);

    return parseSchema(builderDesc.optionSchema);
  }

  protected async runTarget({
    target,
    options = {},
  }: {
    target: Target;
    options?: JsonObject;
  }): Promise<number> {
    const run = await this.architect.scheduleTarget(target, options, {
      logger: this.createLogger(),
    });

    const {error, success} = await run.output.toPromise();
    await run.stop();

    if (error) {
      this.context.stderr.write(error + '\n');
    }

    return success ? 0 : 1;
  }

  protected async runBuilder({
    builder,
    options = {},
  }: {
    builder: string;
    options?: JsonObject;
  }) {
    const run = await this.architect.scheduleBuilder(builder, options, {
      logger: this.createLogger(),
    });

    const {error, success} = await run.output.toPromise();
    await run.stop();

    if (error) {
      this.context.stderr.write(error + '\n'); // TODO logging
    }

    return success ? 0 : 1;
  }
}
