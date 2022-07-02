require('@snuggery-workspace/scripts/load-ts');

const traceCli =
	process.argv.length === 3 &&
	process.argv[2] === '--validate-cli-dependencies';

if (!traceCli) {
	module.exports = require('./index.ts');
} else {
	const start = Date.now();
	const alreadyLoadedFiles = new Set(Object.keys(require.cache));

	module.exports = require('./index.ts');

	console.log('time:', Date.now() - start);

	const allDependencies = new Set();
	const newDependencies = new Set();
	for (const file of Object.keys(require.cache)) {
		const dependency = /(?<=node_modules[/\\])(?:@[^/\\]+[/\\])?[^/\\]+/.exec(
			file,
		)?.[0];
		allDependencies.add(dependency);
		if (!alreadyLoadedFiles.has(file)) {
			newDependencies.add(dependency);
		}
	}

	allDependencies.delete(undefined);
	newDependencies.delete(undefined);

	const disallowedDependencies = new Set([
		'@angular-devkit/architect',
		'@angular-devkit/core',
		'@angular-devkit/schematics',

		'rxjs',
	]);

	for (const dependency of disallowedDependencies) {
		if (allDependencies.has(dependency)) {
			if (!process.exitCode) {
				console.log('Dependencies loaded program:');
			}
			console.log(`❌ ${dependency}`);
			process.exitCode = 1;
		}
	}

	const allowedNewDependencies = new Set([
		// Clipanion, otherwise there is no CLI
		'clipanion',

		// Typanion is needed to validate options, we add semver support to it
		'typanion',
		'semver',

		// Utilities used in the Report
		'@arcanis/slice-ansi',
		'kleur',
		'strip-ansi',
		// transitive dependencies
		'ansi-regex',
		'grapheme-splitter',
	]);

	console.log('Dependencies loaded in CLI:');
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

0 &&
	((exports.findWorkspace = void 0),
	(exports.workspaceFilenames = void 0),
	(exports.run = void 0));
