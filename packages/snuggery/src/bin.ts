#!/usr/bin/env node
import process from 'node:process';

const [major, minor] = process.version.replace(/^v/, '').split('.') as [
	string,
	string,
];

if (parseInt(major) < 14 || (major === '14' && parseInt(minor) < 6)) {
	process.stderr.write(`Snuggery requires at least node version 14.6\n`);
	process.exit(1);
}

import('./cli/index.js')
	.then(async ({findWorkspace, run}) => {
		// Allow overriding the startCwd using an environment variable. This is
		// useful when running a local clone of `sn`
		const startCwd = process.env.SNUGGERY_CWD || process.cwd();
		const workspace = await findWorkspace(startCwd);

		return run(process.argv.slice(2), {
			startCwd,
			workspace,
		});
	})
	.catch(e => {
		process.stderr.write(`Failed to start Snuggery:\n\n${e?.stack ?? e}\n`);
		return 1;
	})
	.then(returnCode => process.exit(returnCode));
