import {Cli, Command, RunContext} from "clipanion";

import type {AbstractCommand} from "./command/abstract-command";
import type {Context} from "./command/context";
import {DoctorCommand} from "./commands/doctor";
import {EntryCommand} from "./commands/entry";
import {EntryWithProjectCommand} from "./commands/entry-with-project";
import {GenerateCommand} from "./commands/generate";
import {HelpCommand} from "./commands/help";
import {HelpBuilderCommand} from "./commands/help/builder";
import {HelpBuildersCommand} from "./commands/help/builders";
import {HelpMigrationsCommand} from "./commands/help/migrations";
import {HelpProjectCommand} from "./commands/help/project";
import {HelpProjectsCommand} from "./commands/help/projects";
import {HelpSchematicCommand} from "./commands/help/schematic";
import {HelpSchematicsCommand} from "./commands/help/schematics";
import {HelpTargetCommand} from "./commands/help/target";
import {HelpTargetsCommand} from "./commands/help/targets";
import {HelpUpdateCommand} from "./commands/help/update";
import {NewCommand} from "./commands/new";
import {ProjectCommand} from "./commands/project";
import {RunBuilderCommand} from "./commands/run/builder";
import {RunMigrationCommand} from "./commands/run/migration";
import {RunMigrationsCommand} from "./commands/run/migrations";
import {RunSchematicCommand} from "./commands/run/schematic";
import {RunTargetCommand} from "./commands/run/target";
import {RunUpdateCommand} from "./commands/run/update";
import {SyncConfigToCommand} from "./commands/sync-config-to";
import {VersionCommand} from "./commands/version";
import {Report} from "./utils/report";

export {workspaceFilenames} from "@snuggery/core";

export type {SnuggeryArchitectHost} from "./architect";
export {CliWorkspace, findWorkspace} from "./command/context";

export {Cli, Context};

export const createArchitectHost: typeof import("./architect").createArchitectHost =
	(...args) => {
		return require("./architect").createArchitectHost(...args);
	};

export function run(
	args: string[],
	context: RunContext<Omit<Context, "report" | "startArgs">>,
): Promise<number> {
	const cli = new Cli<Context>({
		binaryLabel: "Snuggery",
		binaryName: "sn",
		binaryVersion: require("@snuggery/snuggery/package.json").version,
		enableColors: context.colorDepth ? context.colorDepth > 1 : undefined,
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
	cli.register(HelpUpdateCommand);

	cli.register(VersionCommand);
	cli.register(DoctorCommand);
	cli.register(SyncConfigToCommand);

	cli.register(EntryCommand);
	cli.register(EntryWithProjectCommand);
	cli.register(ProjectCommand);

	cli.register(RunTargetCommand);
	cli.register(RunBuilderCommand);

	cli.register(RunSchematicCommand);
	cli.register(GenerateCommand);
	cli.register(NewCommand);

	cli.register(RunUpdateCommand);
	cli.register(RunMigrationCommand);
	cli.register(RunMigrationsCommand);

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
