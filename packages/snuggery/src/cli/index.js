require('@snuggery-workspace/scripts/load-ts');

const traceCli =
	process.argv.length === 3 &&
	process.argv[2] === '--validate-cli-dependencies';

if (!traceCli) {
	module.exports = require('./index.ts');
} else {
	const start = Date.now();
	const loadedFiles = new Set(Object.keys(require.cache));

	module.exports = require('./index.ts');

	console.log('time:', Date.now() - start);

	const dependencies = new Set();
	for (const file of Object.keys(require.cache)) {
		if (!loadedFiles.has(file)) {
			dependencies.add(
				/(?<=node_modules[/\\])(?:@[^/\\]+[/\\])?[^/\\]+/.exec(file)?.[0],
			);
		}
	}

	dependencies.delete(undefined);
	const disallowedDependencies = new Set([
		'@angular-devkit/architect',
		'@angular-devkit/core',
		'@angular-devkit/schematics',

		'rxjs',
	]);

	console.log('Loaded dependencies:');
	for (const dependency of dependencies) {
		if (disallowedDependencies.has(dependency)) {
			console.log(`❌ ${dependency}`);
			process.exitCode = 1;
		} else {
			console.log(`✅ ${dependency}`);
		}
	}

	process.exit();
}

0 && ((exports.findWorkspace = void 0), (exports.run = void 0));
