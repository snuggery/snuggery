import type {BuilderContext, BuilderOutput} from '@angular-devkit/architect';
import {
  getProjectPath,
  resolveWorkspacePath,
} from '@bgotink/atelier/builder-utils';
import {Observable, defer, of} from 'rxjs';
import {concatAll} from 'rxjs/operators';

import {exec} from './exec';
import {resolvePackageBin} from './resolve-package-bin';
import type {Schema, PackageBinarySchema} from './schema';

/**
 * Execute a binary, depending on config either globally installed or installed in a node package
 */
export function execute(
  config: Schema,
  context: BuilderContext,
): Observable<BuilderOutput> {
  return defer(async () => {
    const cwd = config.cwd
      ? resolveWorkspacePath(context, config.cwd)
      : await getProjectPath(context);

    let binary: string;

    if (!isPackageConfiguration(config)) {
      binary = config.binary;
    } else {
      const resolvedBin = await resolvePackageBin(
        config.package,
        config.binary,
        context,
      );

      if (!resolvedBin.success) {
        return of(resolvedBin);
      }

      binary = resolvedBin.bin;
    }

    return exec(cwd, binary, config);
  }).pipe(concatAll());
}

function isPackageConfiguration(config: Schema): config is PackageBinarySchema {
  return 'package' in config && !!config.package;
}
