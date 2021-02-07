/* eslint-disable @typescript-eslint/no-var-requires */

import {isJsonObject} from '@angular-devkit/core';
import {createRequire} from 'module';
import {dirname, join} from 'path';

import {AbstractCommand} from '../command/abstract-command';
import {defaultSchematicCollection} from '../command/schematic';

function getSet<K, T>(map: Map<K, Set<T>>, key: K): Set<T> {
  let set = map.get(key);

  if (set == null) {
    set = new Set();
    map.set(key, set);
  }

  return set;
}

export class VersionCommand extends AbstractCommand {
  static paths = [['--version']];

  static usage = AbstractCommand.Usage({
    category: 'Workspace information commands',
    description: `Print version information`,
  });

  async execute(): Promise<void> {
    const {report, format} = this;

    report.reportInfo(`${format.bold('Snuggery')}\n`);

    const manifestPath = require.resolve('@snuggery/snuggery/package.json');

    report.reportInfo(
      `@snuggery/snuggery   ${format.code(require(manifestPath).version)}`,
    );
    report.reportInfo(
      `@angular-devkit/*  ${format.code(
        require('@angular-devkit/core/package.json').version,
      )}`,
    );

    report.reportSeparator();

    if (
      this.context.globalManifest &&
      this.context.globalManifest !== manifestPath
    ) {
      report.reportInfo(
        `Local snuggery at ${format.code(dirname(manifestPath))}`,
      );
      report.reportInfo(
        `Run via global snuggery version ${format.code(
          require(this.context.globalManifest).version,
        )} at ${format.code(dirname(this.context.globalManifest))}`,
      );

      report.reportSeparator();
    }

    const {workspace} = this.context;

    if (workspace == null) {
      report.reportInfo("There's no workspace configuration.\n");
      return;
    }

    report.reportInfo(`${format.bold('Builders:')}\n`);

    const builderVersions = new Map<string, Set<string>>();

    for (const project of workspace.projects.values()) {
      for (const target of project.targets.values()) {
        const packageName = target.builder.split(':', 1)[0]!;

        if (packageName === '$direct') {
          continue;
        }

        getSet(builderVersions, packageName).add(
          this.getVersion(packageName, project.root),
        );
      }
    }

    if (builderVersions.size === 0) {
      report.reportInfo('No builders configured.\n');
    } else {
      report.reportInfo(
        'Workspace configuration contains builders from these packages:\n',
      );

      const longestPackageNameLength = Array.from(
        builderVersions.keys(),
      ).reduce((a, b) => (a.length > b.length ? a : b)).length;

      for (const [packageName, versions] of builderVersions) {
        report.reportInfo(
          `${packageName.padEnd(
            longestPackageNameLength,
            ' ',
          )}  ${Array.from(versions, v => format.code(v)).join(', ')}`,
        );
      }

      report.reportSeparator();
    }

    report.reportInfo(`${format.bold('Configured schematic packages:')}\n`);

    const schematicVersions = new Map<string, Set<string>>();

    for (const [extensions, root] of [
      [workspace.extensions, null] as const,
      ...Array.from(
        workspace.projects.values(),
        project => [project.extensions, project.root] as const,
      ),
    ]) {
      if (
        isJsonObject(extensions.cli!) &&
        typeof extensions.cli.defaultCollection === 'string'
      ) {
        const {defaultCollection} = extensions.cli;
        getSet(schematicVersions, defaultCollection).add(
          this.getVersion(defaultCollection, root),
        );
      } else if (root == null) {
        // If the root doesn't have a default schematics package, use the global
        // default IF it is installed.
        const version = this.getVersion(defaultSchematicCollection, null);
        if (version !== '<error>') {
          getSet(schematicVersions, defaultSchematicCollection).add(version);
        }
      }

      if (isJsonObject(extensions.schematics!)) {
        for (const schematic of Object.keys(extensions.schematics)) {
          const packageName = schematic.split(':', 1)[0]!;

          getSet(schematicVersions, packageName).add(
            this.getVersion(packageName, root),
          );
        }
      }
    }

    if (schematicVersions.size === 0) {
      report.reportInfo('No schematics configured.\n');
    } else {
      report.reportInfo(
        'Workspace configuration contains schematics from these packages:\n',
      );

      const longestPackageNameLength = Array.from(
        schematicVersions.keys(),
      ).reduce((a, b) => (a.length > b.length ? a : b)).length;

      for (const [packageName, versions] of schematicVersions) {
        report.reportInfo(
          `${packageName.padEnd(
            longestPackageNameLength,
            ' ',
          )}  ${Array.from(versions, v => format.code(v)).join(', ')}`,
        );
      }

      report.reportSeparator();
    }
  }

  private getVersion(packageName: string, projectRoot: string | null): string {
    const {basePath} = this.workspace;

    for (const path of projectRoot
      ? [join(basePath, projectRoot), basePath]
      : [basePath]) {
      const require = createRequire(join(path, '<synthetic>'));

      try {
        return require(join(packageName, 'package.json')).version;
      } catch {
        // ignore
      }
    }

    return '<error>';
  }
}
