#!/usr/bin/env node
import {Cli} from 'clipanion';

import {Context, findWorkspace} from './command/context';
import {HelpCommand} from './commands/help';
import {RunBuilderCommand} from './commands/run-builder';
import {RunTargetCommand} from './commands/run-target';

const cli = new Cli<Context>({
  binaryLabel: 'Atelier',
  binaryName: 'ai',
  binaryVersion: require('@bgotink/atelier/package.json').version,
});

cli.register(HelpCommand);
cli.register(RunTargetCommand);
cli.register(RunBuilderCommand);

const {stderr, stdin, stdout} = process;

const startCwd = process.cwd();

findWorkspace(startCwd)
  .then(workspace =>
    cli.run(process.argv.slice(2), {
      stderr,
      stdin,
      stdout,
      startCwd,
      workspace,
    }),
  )
  .catch(err => {
    stderr.write(cli.error(err));
    return 1;
  })
  .then(returnCode => process.exit(returnCode));
