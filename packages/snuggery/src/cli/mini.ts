import type {MiniWorkspaceOptions} from "@snuggery/core";
import {Cli, Command, RunContext} from "clipanion";

import type {AbstractCommand} from "./command/abstract-command.js";
import type {Context} from "./command/context.js";
import {EntryCommand} from "./mini-commands/entry.js";
import {HelpCommand} from "./mini-commands/help.js";
import {Report} from "./utils/report.js";

export {workspaceFilenames} from "@snuggery/core";

export type {SnuggeryArchitectHost} from "./architect/index.js";
export {
	CliWorkspace,
	findMiniWorkspace as findWorkspace,
} from "./command/context.js";

export {Cli, Context};

export interface MiniCliOptions extends MiniWorkspaceOptions {
	binaryLabel: string;
	binaryName: string;
	binaryVersion: string;
}

export function run(
	args: string[],
	options: MiniCliOptions,
	context: RunContext<Omit<Context, "report" | "startArgs">>,
): Promise<number> {
	const cli = new Cli<Context>({
		binaryLabel: options.binaryLabel,
		binaryName: options.binaryName,
		binaryVersion: options.binaryVersion,
		enableColors: context.colorDepth ? context.colorDepth > 1 : undefined,
	});

	cli.register(HelpCommand);

	cli.register(EntryCommand);

	const stdout = context.stdout ?? Cli.defaultContext.stdout;
	const startArgs = args.slice();

	const command = cli.process(args, {
		...context,
		startArgs,
		report: new Report({
			enableColors: cli.enableColors ?? Cli.defaultContext.colorDepth > 1,
			stdout,
		}),
	});

	const report = new Report({
		enableColors: cli.enableColors ?? Cli.defaultContext.colorDepth > 1,
		stdout,
		verbose: (command as Command<Context> & Partial<AbstractCommand>).verbose,
	});

	return cli.run(command, {
		...context,
		startArgs,
		report,
	});
}
