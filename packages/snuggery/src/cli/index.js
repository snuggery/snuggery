import process from "node:process";

export * from "./index.ts";

const traceCli =
	process.argv.length === 3 &&
	process.argv[2] === "--validate-cli-dependencies";

if (traceCli) {
	const {allDependencies, newDependencies, time} = await import(
		"snuggery:cli-dependencies"
	);

	console.log("time:", time);

	const disallowedDependencies = new Set([
		"@angular-devkit/architect",
		"@angular-devkit/core",
		"@angular-devkit/schematics",

		"rxjs",
		"yaml",
	]);

	for (const dependency of disallowedDependencies) {
		if (allDependencies.has(dependency)) {
			if (!process.exitCode) {
				console.log("Dependencies loaded program:");
			}
			console.log(`❌ ${dependency}`);
			process.exitCode = 1;
		}
	}

	const allowedNewDependencies = new Set([
		// Clipanion, otherwise there is no CLI
		"clipanion",

		// Typanion is needed to validate options, we add semver support to it
		"typanion",
		"semver",

		// Needed to load the workspace configuration
		"@snuggery/core",

		// Utilities used in the Report
		"@arcanis/slice-ansi",
		"kleur",
		"strip-ansi",
		// transitive dependencies
		// "ansi-regex", (required so not intercepted by our loader)
		// "grapheme-splitter", (required so not intercepted by our loader)
	]);

	console.log("Dependencies loaded in CLI:");
	for (const dependency of newDependencies) {
		if (allowedNewDependencies.has(dependency)) {
			console.log(`✅ ${dependency}`);
		} else {
			console.log(`❌ ${dependency}`);
			process.exitCode = 1;
		}
	}

	process.exit();
}
