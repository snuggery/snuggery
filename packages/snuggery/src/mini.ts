import process from 'node:process';

import type {MiniCliOptions} from './cli/mini.js';

export type {MiniCliOptions};

export function run(options: MiniCliOptions): Promise<never> {
	const [major, minor] = process.version.replace(/^v/, '').split('.') as [
		string,
		string,
	];

	if (parseInt(major) < 16 || (major === '16' && parseInt(minor) < 10)) {
		process.stderr.write(
			`${options.binaryLabel} requires at least node version 16.10\n`,
		);
		process.exit(1);
	}

	return import('./cli/mini.js')
		.then(async ({findWorkspace, run}) => {
			// Allow overriding the startCwd using an environment variable. This is
			// useful when running a local clone of `sn`
			const startCwd = process.env.SNUGGERY_CWD || process.cwd();
			const workspace =
				(await (await findWorkspace(startCwd, options))?.workspace()) ?? null;

			return run(process.argv.slice(2), options, {
				startCwd,
				workspace,
			});
		})
		.catch((e) => {
			process.stderr.write(
				`Failed to start ${options.binaryLabel}:\n\n${e?.stack ?? e}\n`,
			);
			return 1;
		})
		.then((returnCode) => process.exit(returnCode));
}
