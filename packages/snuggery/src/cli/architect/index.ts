import type {CliWorkspace, Context} from '../command/context';

import {SnuggeryArchitectHost} from './host';
import {Resolver} from './resolution';
import {CliWorkspaceFacade} from './workspace';

export * from './errors';
export {
  SnuggeryArchitectHost,
  ResolverFacade,
  WorkspaceFacade,
  SnuggeryBuilderInfo,
} from './host';

export function createArchitectHost(
  context: Pick<Context, 'startCwd'>,
  workspace?: CliWorkspace | null,
): SnuggeryArchitectHost {
  const workspaceFacade = new CliWorkspaceFacade(workspace);
  return new SnuggeryArchitectHost(
    context,
    new Resolver(context, workspaceFacade),
    workspaceFacade,
  );
}
