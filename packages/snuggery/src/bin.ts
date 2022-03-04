#!/usr/bin/env node

const [major, minor] = process.version.replace(/^v/, '').split('.') as [
	string,
	string,
];

if (parseInt(major) < 12 || (major === '12' && parseInt(minor) < 2)) {
	process.stderr.write(`Snuggery requires at least node version 12.2\n`);
	process.exit(1);
}

import('./cli')
	.then(async ({findWorkspace, run}) => {
		// Allow overriding the startCwd using an environment variable. This is
		// useful when running a local clone of `sn`
		const startCwd = process.env.SNUGGERY_CWD || process.cwd();
		const {stderr, stdin, stdout} = process;

		const workspace = await findWorkspace(startCwd);

		return run(process.argv.slice(2), {
			stdin,
			stdout,
			stderr,
			startCwd,
			workspace,
		});
	})
	.catch(e => {
		process.stderr.write(`Failed to start Snuggery:\n\n${e?.stack ?? e}\n`);
		return 1;
	})
	.then(returnCode => process.exit(returnCode));
