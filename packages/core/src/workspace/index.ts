import type {JsonValue, workspaces} from '@angular-devkit/core';
import {parse, ParseError, printParseErrorCode} from 'jsonc-parser';
import {posix} from 'path';

import {isAngularWorkspace, angularWorkspace} from './angular';
import type {WorkspaceType} from './interface';
import {isTaoWorkspace, taoWorkspace} from './tao';

export enum WorkspaceFormat {
  Angular = 'angular',
  Tao = 'tao',
  // Snuggery = 'snuggery',
}

const types: {[format in WorkspaceFormat]: WorkspaceType} = {
  angular: angularWorkspace,
  tao: taoWorkspace,
};

export const workspaceFilenames = Object.freeze([
  // Replace these if snuggery.json ever deviates from angular.json
  'snuggery.json',
  '.snuggery.json',

  'angular.json',
  '.angular.json',

  'workspace.json',
  '.workspace.json',
]);

export type WorkspaceHost = workspaces.WorkspaceHost;

export type ProjectDefinition = workspaces.ProjectDefinition;
export type ProjectDefinitionCollection =
  workspaces.ProjectDefinitionCollection;
export type TargetDefinition = workspaces.TargetDefinition;
export type TargetDefinitionCollection = workspaces.TargetDefinitionCollection;
export type WorkspaceDefinition = workspaces.WorkspaceDefinition;

async function findFormat(
  path: string,
  host: WorkspaceHost,
): Promise<[path: string, format: WorkspaceFormat]> {
  if (path.endsWith('/') || (await host.isDirectory(path))) {
    for (const filename of workspaceFilenames) {
      try {
        return await findFormat(posix.join(path, filename), host);
      } catch (e) {
        if ((e as NodeJS.ErrnoException)?.code !== 'ENOENT') {
          throw e;
        }

        // try the next file
      }
    }

    throw new Error(`Couldn't find configuration at ${path}`);
  }

  if (!(await host.isFile(path))) {
    throw Object.assign(new Error(`Not a file: ${path}`), {code: 'ENOENT'});
  }

  const errors: ParseError[] = [];
  const configuration = parse(await host.readFile(path), errors, {
    allowTrailingComma: true,
    allowEmptyContent: false,
  }) as JsonValue;

  if (errors.length) {
    if (errors.length === 1) {
      throw new Error(
        `Error while parsing ${path}: ${printParseErrorCode(
          errors[0]!.error,
        )} at ${errors[0]!.offset}`,
      );
    }

    throw new Error(
      `Errors while parsing ${path}:\n${errors
        .map(err => `- ${printParseErrorCode(err.error)} at ${err.offset}`)
        .join('\n')}`,
    );
  }

  if (
    typeof configuration !== 'object' ||
    configuration == null ||
    Array.isArray(configuration)
  ) {
    throw new Error(
      `Invalid configuration, expected an object but got ${
        configuration &&
        (Array.isArray(configuration) ? 'array' : typeof configuration)
      }`,
    );
  }

  const filename = posix.basename(path);
  let format: WorkspaceFormat;

  if (isAngularWorkspace(filename, configuration)) {
    format = WorkspaceFormat.Angular;
  } else if (isTaoWorkspace(filename, configuration)) {
    format = WorkspaceFormat.Tao;
  } else {
    throw new Error(`Couldn't find configuration at ${path}`);
  }

  return [path, format];
}

const cachedFormats = new WeakMap<WorkspaceDefinition, WorkspaceFormat>();

export async function parseWorkspace(
  path: string,
  host: WorkspaceHost,
): Promise<WorkspaceDefinition> {
  const [realPath, format] = await findFormat(path, host);

  const result = await types[format].parse(realPath, host);
  cachedFormats.set(result, format);

  return result;
}

export async function writeWorkspace(
  path: string,
  host: WorkspaceHost,
  workspace: WorkspaceDefinition,
): Promise<void> {
  let format = cachedFormats.get(workspace);

  if (format == null) {
    [path, format] = await findFormat(path, host);
  }

  await types[format].write(path, host, workspace);
}

export async function updateWorkspace<T>(
  path: string,
  host: WorkspaceHost,
  updater: (workspace: WorkspaceDefinition) => T | PromiseLike<T>,
): Promise<T> {
  const [realPath, format] = await findFormat(path, host);

  const workspace = await types[format].parse(realPath, host);
  const result = await updater(workspace);
  await types[format].write(realPath, host, workspace);
  return result;
}
