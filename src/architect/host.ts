import {Target, BuilderInfo} from '@angular-devkit/architect';
import {
  ArchitectHost,
  Builder,
  BuilderSymbol,
} from '@angular-devkit/architect/src/internal';
import {isJsonObject, JsonObject, JsonValue} from '@angular-devkit/core';
import {createRequire} from 'module';
import {dirname, join} from 'path';

import {CliWorkspace, Context} from '../command/context';

export class UnknownBuilderError extends Error {
  public clipanion = {type: 'none'};

  constructor(message: string) {
    super(message);
    this.name = 'UnknownBuilderError';
  }
}

export class UnknownConfigurationError extends Error {
  public clipanion = {type: 'none'};

  constructor(message: string) {
    super(message);
    this.name = 'UnknownConfigurationError';
  }
}

export class InvalidBuilderError extends Error {
  public clipanion = {type: 'none'};

  constructor(message: string) {
    super(message);
    this.name = 'InvalidBuilderError';
  }
}

export class UnknownTargetError extends Error {
  public clipanion = {type: 'none'};

  constructor(message: string) {
    super(message);
    this.name = 'UnknownTargetError';
  }
}

export interface AtelierBuilderInfo extends BuilderInfo {
  packageName: string;
  implementationPath: string;
}

export class AtelierArchitectHost implements ArchitectHost<AtelierBuilderInfo> {
  constructor(
    private readonly context: Context,
    private readonly workspace: CliWorkspace,
  ) {}

  private loadBuilderJson(
    packageName: string,
    builderSpec: string,
  ): [path: string, builders: JsonObject] {
    for (const basePath of new Set([
      this.context.startCwd,
      this.workspace.basePath,
    ])) {
      const require = createRequire(join(basePath, 'synthetic.js'));

      let pJson: JsonObject;
      try {
        pJson = require(join(packageName, 'package.json'));
      } catch {
        continue;
      }

      if (typeof pJson.builders !== 'string') {
        throw new InvalidBuilderError(
          `No builder configuration found in package "${packageName}" for builder "${builderSpec}"`,
        );
      }

      try {
        const builderJsonPath = require.resolve(
          join(packageName, pJson.builders),
        );
        const builderJson = require(builderJsonPath);

        if (
          !isJsonObject(builderJson) ||
          !isJsonObject(builderJson.builders!)
        ) {
          throw new Error(`configuration doesn't match schema`);
        }

        return [builderJsonPath, builderJson.builders];
      } catch (e) {
        throw new InvalidBuilderError(
          `Invalid builder configuration found in package "${packageName}" for builder "${builderSpec}": ${
            (e as Error)?.message || e
          }`,
        );
      }
    }

    throw new UnknownBuilderError(
      `Couldn't find package "${packageName}" for builder "${builderSpec}"`,
    );
  }

  private getProject(projectName: string) {
    const project = this.workspace.projects.get(projectName);

    if (project == null) {
      throw new UnknownTargetError(`Unknown project: "${projectName}"`);
    }

    return project;
  }

  private getTarget(target: Target) {
    const projectTarget = this.getProject(target.project).targets.get(
      target.target,
    );

    if (projectTarget == null) {
      throw new UnknownTargetError(
        `No target named "${target.target}" found in project "${target.project}"`,
      );
    }

    return projectTarget;
  }

  async getBuilderNameForTarget(target: Target): Promise<string> {
    return this.getTarget(target).builder;
  }

  async resolveBuilder(builderSpec: string): Promise<AtelierBuilderInfo> {
    const [packageName, builderName] = builderSpec.split(':', 2);

    if (packageName == null || builderName == null) {
      throw new UnknownBuilderError(
        `Builder name doesn't match <packageName>:<builderName>: "${builderSpec}"`,
      );
    }

    const [builderPath, builderJson] = this.loadBuilderJson(
      packageName,
      builderSpec,
    );

    if (!Object.prototype.hasOwnProperty.call(builderJson, builderName)) {
      throw new UnknownBuilderError(
        `Can't find "${builderName}" in "${packageName}"`,
      );
    }

    let builderInfo = builderJson[builderName]!;
    if (
      !isJsonObject(builderInfo) ||
      typeof builderInfo.implementation !== 'string' ||
      typeof builderInfo.schema !== 'string'
    ) {
      throw new InvalidBuilderError(
        `Invalid configuration for builder "${builderName}" in package "${packageName}"`,
      );
    }

    const schemaPath = join(dirname(builderPath), builderInfo.schema);
    let optionSchema: JsonValue;
    try {
      optionSchema = require(schemaPath);
    } catch {
      throw new InvalidBuilderError(
        `Couldn't load schema "${schemaPath}" for builder "${builderName}" in package "${packageName}"`,
      );
    }

    if (!isJsonObject(optionSchema)) {
      throw new InvalidBuilderError(
        `Invalid schema at "${schemaPath}" for builder "${builderName}" in package "${packageName}"`,
      );
    }

    const description =
      typeof builderInfo.description === 'string'
        ? builderInfo.description
        : undefined!;

    return {
      packageName,
      builderName,
      description,
      optionSchema,
      implementationPath: join(
        dirname(builderPath),
        builderInfo.implementation,
      ),
    };
  }

  async loadBuilder(
    info: AtelierBuilderInfo,
  ): Promise<Builder<JsonObject> | null> {
    let implementation;
    try {
      implementation = await import(info.implementationPath).then(
        module => module.default ?? module,
      );
    } catch (e) {
      throw new InvalidBuilderError(
        `Failed to load implementation for builder "${
          info.builderName
        }" in package "${info.packageName}": ${(e as Error)?.message ?? e}`,
      );
    }

    if (!implementation[BuilderSymbol]) {
      throw new InvalidBuilderError(
        `Implementation for builder "${info.builderName}" in package "${info.packageName}" is not a builder`,
      );
    }

    return implementation;
  }

  getCurrentDirectory(): Promise<string> {
    return Promise.resolve(this.context.startCwd);
  }

  getWorkspaceRoot(): Promise<string> {
    return Promise.resolve(this.workspace.basePath);
  }

  async getOptionsForTarget(target: Target): Promise<JsonObject | null> {
    const targetDefinition = this.getTarget(target);
    const options: JsonObject = {};

    if (targetDefinition.options != null) {
      Object.assign(options, targetDefinition.options);
    }

    for (const configuration of target.configuration?.split(',') || []) {
      const configurationOptions =
        targetDefinition.configurations?.[configuration];

      if (configurationOptions == null) {
        throw new UnknownConfigurationError(
          `Target "${target.target}" in project "${target.project}" doesn't have a configuration named "${configuration}"`,
        );
      }

      Object.assign(options, configurationOptions);
    }

    return options;
  }

  getProjectMetadata(projectName: string): Promise<JsonObject | null>;
  getProjectMetadata(target: Target): Promise<JsonObject | null>;
  async getProjectMetadata(
    projectNameOrTarget: string | Target,
  ): Promise<JsonObject | null> {
    const projectDefinition = this.getProject(
      typeof projectNameOrTarget === 'string'
        ? projectNameOrTarget
        : projectNameOrTarget.project,
    );

    return {
      root: projectDefinition.root,
      sourceRoot: projectDefinition.sourceRoot!,
      prefix: projectDefinition.prefix!,
      ...projectDefinition.extensions,
    };
  }
}
