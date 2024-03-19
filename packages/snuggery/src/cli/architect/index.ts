import type {CliWorkspace, Context} from "../command/context.js";

import {SnuggeryArchitectHost} from "./host.js";
import {Resolver} from "./resolution.js";
import {CliWorkspaceFacade} from "./workspace.js";

export {
	InvalidBuilderError,
	InvalidBuilderSpecifiedError,
	UnknownBuilderError,
	UnknownConfigurationError,
	UnknownTargetError,
} from "./errors.js";
export {
	SnuggeryArchitectHost,
	type ResolverFacade,
	type WorkspaceFacade,
	type SnuggeryBuilderInfo,
} from "./host.js";

export function createArchitectHost(
	context: Pick<Context, "startCwd">,
	workspace?: CliWorkspace | null,
): SnuggeryArchitectHost {
	const workspaceFacade = new CliWorkspaceFacade(workspace);
	return new SnuggeryArchitectHost(
		context,
		new Resolver(context, workspaceFacade),
		workspaceFacade,
	);
}
