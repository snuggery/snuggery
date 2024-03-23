import {Cli, Command, RunContext} from "clipanion";
import {createRequire} from "node:module";

import type {SnuggeryArchitectHost} from "./architect/index.js";
import type {AbstractCommand} from "./command/abstract-command.js";
import type {CliWorkspace, Context} from "./command/context.js";
import {DoctorCommand} from "./commands/doctor.js";
import {EntryWithProjectCommand} from "./commands/entry-with-project.js";
import {EntryCommand} from "./commands/entry.js";
import {GenerateCommand} from "./commands/generate.js";
import {HelpBuilderCommand} from "./commands/help/builder.js";
import {HelpBuildersCommand} from "./commands/help/builders.js";
import {HelpMigrationsCommand} from "./commands/help/migrations.js";
import {HelpProjectCommand} from "./commands/help/project.js";
import {HelpProjectsCommand} from "./commands/help/projects.js";
import {HelpSchematicCommand} from "./commands/help/schematic.js";
import {HelpSchematicsCommand} from "./commands/help/schematics.js";
import {HelpTargetCommand} from "./commands/help/target.js";
import {HelpTargetsCommand} from "./commands/help/targets.js";
import {HelpUpdateCommand} from "./commands/help/update.js";
import {HelpCommand} from "./commands/help.js";
import {NewCommand} from "./commands/new.js";
import {ProjectCommand} from "./commands/project.js";
import {RunBuilderCommand} from "./commands/run/builder.js";
import {RunMigrationCommand} from "./commands/run/migration.js";
import {RunMigrationsCommand} from "./commands/run/migrations.js";
import {RunSchematicCommand} from "./commands/run/schematic.js";
import {RunTargetCommand} from "./commands/run/target.js";
import {RunUpdateCommand} from "./commands/run/update.js";
import {SyncConfigToCommand} from "./commands/sync-config-to.js";
import {VersionCommand} from "./commands/version.js";
import {Report} from "./utils/report.js";

export {workspaceFilenames} from "@snuggery/core";

export type {SnuggeryArchitectHost} from "./architect/index.js";
export {CliWorkspace, findWorkspace} from "./command/context.js";

export {Cli, Context};

export async function createArchitectHost(
	context: Pick<Context, "startCwd">,
	workspace?: CliWorkspace | null,
): Promise<SnuggeryArchitectHost> {
	const {createArchitectHost} = await import("./architect/index.js");
	return createArchitectHost(context, workspace);
}

export function run(
	args: string[],
	context: RunContext<Omit<Context, "report" | "startArgs">>,
): Promise<number> {
	const cli = new Cli<Context>({
		binaryLabel: "Snuggery",
		binaryName: "sn",
		binaryVersion: createRequire(import.meta.url)(
			"@snuggery/snuggery/package.json",
		).version,
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
