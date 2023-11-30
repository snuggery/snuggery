#!/usr/bin/env node
/* cspell:word positionals */

import {tags} from "@angular-devkit/core";
import {createConsoleLogger} from "@angular-devkit/core/node";
import {UnsuccessfulWorkflowExecution} from "@angular-devkit/schematics";
import {
	NodeModulesEngineHost,
	NodeWorkflow,
} from "@angular-devkit/schematics/tools";
import {parseArgs} from "@pkgjs/parseargs";
import kleur from "kleur";
import {stat, readFile} from "node:fs/promises";
import {createRequire} from "node:module";
import {join, resolve} from "node:path";
import {cwd} from "node:process";
import semver from "semver";

/**
 * @typedef {import('@angular-devkit/schematics/tools').FileSystemCollectionDesc & {
 * 		readonly journey?: import('@angular-devkit/schematics/tools').FileSystemCollectionDesc['schematics'];
 * }} FileSystemCollectionDesc
 */

/**
 * @typedef {import('@angular-devkit/schematics/tools').FileSystemSchematicDescription & {
 * 		version?: string | null;
 *    optional?: boolean;
 * }} FileSystemSchematicDescription
 */

class JourneyEngineHost extends NodeModulesEngineHost {
	/**
	 * @protected
	 * @override
	 * @param {string} name
	 * @param {Partial<FileSystemCollectionDesc>} desc
	 * @returns {FileSystemCollectionDesc}
	 */
	_transformCollectionDescription(name, desc) {
		let {schematics} = desc;
		if (desc.journey && typeof desc.journey === "object") {
			schematics = desc.journey;
		}

		return super._transformCollectionDescription(name, {...desc, schematics});
	}
}

const {values: options, positionals} = parseArgs({
	allowPositionals: true,
	options: {
		from: {type: "string"},
		to: {type: "string"},
		partial: {type: "boolean"},

		force: {
			type: "boolean",
			short: "f",
		},
		root: {
			type: "string",
			short: "r",
		},
		help: {
			type: "boolean",
			short: "h",
		},
		verbose: {
			type: "boolean",
			short: "v",
		},
		"dry-run": {
			type: "boolean",
			short: "d",
		},
	},
});

if (options.help || positionals.length !== 1 || (options.to && !options.from)) {
	process.stderr.write(tags.stripIndent`
		Usage: journey [options] <package>
		       journey [options] --from <version> <package>

		Options:
		  -f, --force   		overwrite files that the journeys try to create if they already exist
		  -d, --dry-run 		only show files that would be changed, don't make any actual changes
		  -v, --verbose 		include debug logging
		  -h, --help    		print this help message

		Options when using --from:
		  --from        		version to journey from
		  --to          		version to journey towards, defaults to the currently installed version
		  --partial      		pick and choose which journeys to run
	`);
	process.stderr.write("\n");
	process.exit(options.help ? 0 : 1);
}

const root = options.root ?? cwd();
const [arg] = /** @type {[string]} */ (positionals);

let journeyFilePath;
let defaultVersion;

if (
	await stat(arg).then(
		(s) => s.isFile(),
		() => false,
	)
) {
	journeyFilePath = resolve(arg);
	defaultVersion = null;
} else {
	const pkgName = arg;
	let pkgJsonPath;
	try {
		pkgJsonPath = createRequire(join(root, "<synthetic>")).resolve(
			`${pkgName}/package.json`,
		);
	} catch (e) {
		process.stderr.write(`Failed to find package ${JSON.stringify(pkgName)}\n`);
		process.exit(1);
	}

	const pkgJson = JSON.parse(await readFile(pkgJsonPath, "utf-8"));
	defaultVersion = /** @type {string} */ (pkgJson.version);

	journeyFilePath = pkgJson.journey ?? pkgJson["ng-update"]?.migrations;
	if (typeof journeyFilePath !== "string") {
		process.stderr.write(
			`Package ${JSON.stringify(pkgName)} doesn't define a journey\n`,
		);
		process.exit(1);
	}

	const localRequire = createRequire(pkgJsonPath);
	try {
		journeyFilePath = localRequire.resolve(`./${journeyFilePath}`);
	} catch {
		try {
			journeyFilePath = localRequire.resolve(journeyFilePath);
		} catch {
			process.stderr.write(
				`Can't find journey file in package ${JSON.stringify(pkgName)}\n`,
			);
			process.exit(1);
		}
	}
}

const workflow = new NodeWorkflow(root, {
	engineHostCreator(options) {
		return new JourneyEngineHost(options.resolvePaths);
	},
	resolvePaths: [root],
	force: options.force,
	dryRun: options["dry-run"],
});

const collection = workflow.engine.createCollection(journeyFilePath);
/** @type {FileSystemSchematicDescription[]} */
const migrations = [];

/** @type {FileSystemSchematicDescription[]} */
const optionalMigrations = [];

if (!options.from) {
	for (const name of collection.listSchematicNames()) {
		const schematic = workflow.engine.createSchematic(name, collection);
		const description =
			/** @type {FileSystemSchematicDescription} */
			(schematic.description);

		if (description.version == null) {
			optionalMigrations.push(description);
		}
	}
} else {
	if (!semver.valid(options.from)) {
		process.stderr.write(`Invalid version in --from\n`);
		process.exit(1);
	}
	const to = options.to ?? defaultVersion;
	if (to == null) {
		process.stderr.write(
			`Couldn't detect version to start from, please pass a start version using --from\n`,
		);
		process.exit(1);
	} else if (!semver.valid(to)) {
		process.stderr.write(`Invalid version in --to\n`);
		process.exit(1);
	}

	const migrationRange = new semver.Range(
		">" +
			(semver.prerelease(options.from)
				? options.from.split("-")[0] + "-0"
				: options.from) +
			" <=" +
			to.split("-")[0],
	);

	for (const name of collection.listSchematicNames()) {
		const schematic = workflow.engine.createSchematic(name, collection);
		const description =
			/** @type {FileSystemSchematicDescription} */
			(schematic.description);

		description.version = semver.valid(description.version);
		if (!description.version) {
			continue;
		}

		if (
			semver.satisfies(description.version, migrationRange, {
				includePrerelease: true,
			})
		) {
			(options.partial || description.optional
				? optionalMigrations
				: migrations
			).push(description);
		}
	}

	/** @type {(FileSystemSchematicDescription & {version: string})[]} */ (
		optionalMigrations
	).sort(
		(a, b) =>
			semver.compare(a.version, b.version) || a.name.localeCompare(b.name),
	);
}

if (optionalMigrations.length) {
	const {default: prompt} = await import("prompts");

	/** @type {{includedMigrations: string[]}} */
	const {includedMigrations = []} = await prompt({
		name: "includedMigrations",
		type: "multiselect",
		message: "Select optional journeys to run",
		choices: optionalMigrations.map((migration) => {
			const {title, description} = getMigrationTitleAndDescription(migration);

			return {
				title: title,
				description,
				value: migration.name,
			};
		}),
		stdout: process.stderr,
	});

	migrations.push(
		...includedMigrations.map(
			(name) => collection.createSchematic(name).description,
		),
	);
}

if (migrations.length === 0) {
	process.stderr.write("Nothing to do\n");
	process.exit(0);
}

if (options.from) {
	/** @type {(FileSystemSchematicDescription & {version: string})[]} */ (
		migrations
	).sort(
		(a, b) =>
			semver.compare(a.version, b.version) || a.name.localeCompare(b.name),
	);
}

const logger = createConsoleLogger(options.verbose, undefined, undefined, {
	warn: (message) => kleur.bold().yellow(message),
	error: (message) => kleur.bold().red(message),
	fatal: (message) => kleur.bold().red(message),
});

logger.info(kleur.cyan(`Executing ${positionals[0]} journey\n`));

for (const migration of migrations) {
	let error = false;
	/** @type {Set<string>} */
	const files = new Set();
	/** @type {string[]} */
	let logs = [];

	logger.info(
		kleur.bold(`** ${getMigrationTitleAndDescription(migration).title}`),
	);

	const reporterSubscription = !options["dry-run"]
		? workflow.reporter.subscribe((event) => {
				if (event.kind === "error") {
					error = true;
					reporterSubscription.unsubscribe();
				} else {
					const eventPath =
						event.path.charAt(0) === "/" ? event.path.substring(1) : event.path;
					files.add(eventPath);
				}
		  })
		: workflow.reporter.subscribe((event) => {
				// Strip leading slash to prevent confusion.
				const eventPath =
					event.path.charAt(0) === "/" ? event.path.substring(1) : event.path;

				switch (event.kind) {
					case "error": {
						error = true;
						const desc =
							event.description == "alreadyExist"
								? "already exists"
								: "does not exist";
						logger.error(`Error: ${eventPath} ${desc}`);
						break;
					}
					case "update":
						logs.push(`${kleur.cyan("Update")} ${eventPath}`);
						files.add(eventPath);
						break;
					case "create":
						logs.push(`${kleur.green("Create")} ${eventPath}`);
						files.add(eventPath);
						break;
					case "delete":
						logs.push(`${kleur.yellow("Delete")} ${eventPath}`);
						files.add(eventPath);
						break;
					case "rename": {
						const eventToPath =
							event.to.charAt(0) === "/" ? event.to.substring(1) : event.to;
						logs.push(`${kleur.blue("Rename")} ${eventPath} => ${eventToPath}`);
						files.add(eventPath);
						break;
					}
				}
		  });

	const lifecycleSubscription = workflow.lifeCycle.subscribe((event) => {
		if (event.kind == "end" || event.kind == "post-tasks-start") {
			if (!error) {
				// Output the logging queue, no error happened.
				logs.forEach((log) => logger.info(log));
			}

			logs = [];
			error = false;
		}
	});

	try {
		await workflow
			.execute({
				collection: collection.description.name,
				schematic: migration.name,
				options: {},
				logger,
			})
			.toPromise();

		if (error) {
			break;
		}
	} catch (e) {
		if (e instanceof UnsuccessfulWorkflowExecution) {
			logger.error(`❌ Journey failed. See above for further details.\n`);
		} else {
			logger.fatal(
				`❌ Journey failed: ${
					/** @type {Error} */ (e)?.[options.verbose ? "stack" : "message"] ?? e
				}\n`,
			);
		}

		process.exit(1);
	} finally {
		reporterSubscription.unsubscribe();
		lifecycleSubscription.unsubscribe();
	}

	switch (files.size) {
		case 0:
			logger.info(`Nothing has changed`);
			break;
		case 1:
			logger.info(`1 file has changed`);
			break;
		default:
			logger.info(`${files.size} files have changed`);
	}

	logger.info("");
}

logger.info(`🏁 Finished!`);

/**
 * @param {FileSystemSchematicDescription} migration
 */
function getMigrationTitleAndDescription(migration) {
	const [title, ...description] = /** @type {[string, ...string[]]} */ (
		migration.description.split(". ")
	);

	return {
		title: title.endsWith(".") ? title : title + ".",
		description: description.join(".\n  ") || undefined,
	};
}
