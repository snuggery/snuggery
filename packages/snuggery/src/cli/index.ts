import {Cli, Command} from 'clipanion';
// @ts-expect-error There are no good types for supports-color
import {supportsColor} from 'supports-color';

import type {AbstractCommand} from './command/abstract-command';
import type {Context} from './command/context';
import {EntryCommand} from './commands/entry';
import {EntryWithProjectCommand} from './commands/entry-with-project';
import {GenerateCommand} from './commands/generate';
import {HelpCommand} from './commands/help';
import {HelpBuilderCommand} from './commands/help/builder';
import {HelpBuildersCommand} from './commands/help/builders';
import {HelpMigrationsCommand} from './commands/help/migrations';
import {HelpProjectCommand} from './commands/help/project';
import {HelpProjectsCommand} from './commands/help/projects';
import {HelpSchematicCommand} from './commands/help/schematic';
import {HelpSchematicsCommand} from './commands/help/schematics';
import {HelpTargetCommand} from './commands/help/target';
import {HelpTargetsCommand} from './commands/help/targets';
import {NewCommand} from './commands/new';
import {ProjectCommand} from './commands/project';
import {RunBuilderCommand} from './commands/run/builder';
import {RunMigrationCommand} from './commands/run/migration';
import {RunSchematicCommand} from './commands/run/schematic';
import {RunTargetCommand} from './commands/run/target';
import {VersionCommand} from './commands/version';
import {Report} from './utils/report';

export {SnuggeryArchitectHost} from './architect/host';
export {CliWorkspace, findWorkspace} from './command/context';

export {Cli, Context};

export function run(
  args: string[],
  context: Omit<Context, 'report'>,
): Promise<number> {
  const cli = new Cli<Context>({
    binaryLabel: 'Snuggery',
    binaryName: 'sn',
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    binaryVersion: require('@snuggery/snuggery/package.json').version,
    enableColors: supportsColor(context.stdout).level > 0,
  });

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

  const command = cli.process(args);

  const report = new Report({
    cli,
    stdout: context.stdout,
    verbose: (command as Command<Context> & Partial<AbstractCommand>).verbose,
  });

  return cli.run(command, {
    ...context,
    report,
  });
}
