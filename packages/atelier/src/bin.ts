#!/usr/bin/env node
import {Cli, UsageError} from 'clipanion';
// @ts-expect-error There are no good types for supports-color
import {supportsColor} from 'supports-color';

import {Context, findWorkspace} from './cli/command/context';
import {EntryCommand} from './cli/commands/entry';
import {EntryWithProjectCommand} from './cli/commands/entry-with-project';
import {GenerateCommand} from './cli/commands/generate';
import {HelpCommand} from './cli/commands/help';
import {HelpBuilderCommand} from './cli/commands/help/builder';
import {HelpBuildersCommand} from './cli/commands/help/builders';
import {HelpMigrationsCommand} from './cli/commands/help/migrations';
import {HelpProjectCommand} from './cli/commands/help/project';
import {HelpProjectsCommand} from './cli/commands/help/projects';
import {HelpSchematicCommand} from './cli/commands/help/schematic';
import {HelpSchematicsCommand} from './cli/commands/help/schematics';
import {HelpTargetCommand} from './cli/commands/help/target';
import {HelpTargetsCommand} from './cli/commands/help/targets';
import {NewCommand} from './cli/commands/new';
import {ProjectCommand} from './cli/commands/project';
import {RunBuilderCommand} from './cli/commands/run/builder';
import {RunMigrationCommand} from './cli/commands/run/migration';
import {RunSchematicCommand} from './cli/commands/run/schematic';
import {RunTargetCommand} from './cli/commands/run/target';
import {VersionCommand} from './cli/commands/version';
import {Report} from './cli/utils/report';

const [major, minor] = process.version.replace(/^v/, '').split('.') as [
  string,
  string,
];

const cli = new Cli<Context>({
  binaryLabel: 'Atelier',
  binaryName: 'ai',
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  binaryVersion: require('@bgotink/atelier/package.json').version,
  enableColors: supportsColor(process.stdout).level > 0,
});

if (parseInt(major) < 12 || (major === '12' && parseInt(minor) < 2)) {
  process.stderr.write(
    cli.error(new UsageError(`Atelier requires at least node version 12.2`)),
  );

  process.exit(1);
}

cli.register(HelpCommand);
cli.register(HelpBuilderCommand);
cli.register(HelpBuildersCommand);
cli.register(HelpMigrationsCommand);
cli.register(HelpProjectCommand);
cli.register(HelpProjectsCommand);
cli.register(HelpSchematicCommand);
cli.register(HelpSchematicsCommand);
cli.register(HelpTargetCommand);
cli.register(HelpTargetsCommand);

cli.register(VersionCommand);

cli.register(EntryCommand);
cli.register(EntryWithProjectCommand);
cli.register(ProjectCommand);

cli.register(RunTargetCommand);
cli.register(RunBuilderCommand);

cli.register(RunSchematicCommand);
cli.register(GenerateCommand);
cli.register(NewCommand);
cli.register(RunMigrationCommand);

const {stderr, stdin, stdout} = process;

const report = new Report({
  cli,
  stdout,
});

const startCwd = process.cwd();

findWorkspace(startCwd)
  .then(workspace =>
    cli.run(process.argv.slice(2), {
      stderr,
      stdin,
      stdout,
      startCwd,
      workspace,
      report,
    }),
  )
  .catch(err => {
    report.reportError(cli.error(err));
    return 1;
  })
  .then(returnCode => process.exit(returnCode));
