#!/usr/bin/env node
import {Cli, UsageError} from 'clipanion';

import {Context, findWorkspace} from './command/context';
import {EntryCommand} from './commands/entry';
import {EntryWithProjectCommand} from './commands/entry-with-project';
import {GenerateCommand} from './commands/generate';
import {HelpCommand} from './commands/help';
import {ProjectCommand} from './commands/project';
import {RunBuilderCommand} from './commands/run-builder';
import {RunTargetCommand} from './commands/run-target';
import {Report} from './utils/report';

const [major, minor] = process.version.replace(/^v/, '').split('.') as [
  string,
  string,
];

const cli = new Cli<Context>({
  binaryLabel: 'Atelier',
  binaryName: 'ai',
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  binaryVersion: require('@bgotink/atelier/package.json').version,
});

if (parseInt(major) < 12 || (major === '12' && parseInt(minor) < 2)) {
  process.stderr.write(
    cli.error(new UsageError(`Atelier requires at least node version 12.2`)),
  );

  process.exit(1);
}

cli.register(HelpCommand);
cli.register(EntryCommand);
cli.register(EntryWithProjectCommand);
cli.register(ProjectCommand);

cli.register(RunTargetCommand);
cli.register(RunBuilderCommand);

cli.register(GenerateCommand);

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
