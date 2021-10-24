#!/usr/bin/env node

/* eslint-disable @typescript-eslint/no-var-requires */

import type {PnpApi} from '@yarnpkg/pnp';
import {promises as fs} from 'fs';
import {createRequire} from 'module';
import {dirname, join, parse as parsePath} from 'path';

const [major, minor] = process.version.replace(/^v/, '').split('.') as [
	string,
	string,
];

if (parseInt(major) < 12 || (major === '12' && parseInt(minor) < 2)) {
	process.stderr.write(`Snuggery requires at least node version 12.2\n`);
	process.exit(1);
}

const startCwd = process.cwd();

import('@snuggery/snuggery/cli')
	.then(async function (
		globalSnuggery,
	): Promise<
		Pick<typeof import('@snuggery/snuggery/cli'), 'findWorkspace' | 'run'>
	> {
		const workspace = await globalSnuggery.findWorkspace(startCwd);

		if (workspace == null) {
			return globalSnuggery;
		}

		if (process.versions.pnp == null) {
			const pnpFile = await findUp(['.pnp.js', '.pnp.cjs'], workspace.basePath);

			if (pnpFile != null) {
				const pnpapi = (await import(pnpFile)) as PnpApi & {setup?: () => void};

				if (typeof pnpapi.setup === 'function') {
					pnpapi.setup();
				}

				const pnpRequire = `--require ${
					/\s/.test(pnpFile) ? JSON.stringify(pnpFile) : pnpFile
				}`;
				process.env.NODE_OPTIONS = process.env.NODE_OPTIONS
					? `${process.env.NODE_OPTIONS} ${pnpRequire}`
					: pnpRequire;
			}
		}

		try {
			const require = createRequire(join(workspace.basePath, '<workspace>'));
			const localCli =
				require('@snuggery/snuggery/cli') as typeof import('@snuggery/snuggery/cli');

			if (
				typeof localCli.run === 'function' &&
				typeof localCli.findWorkspace === 'function'
			) {
				return localCli;
			}

			// The cli endpoint doesn't expose a run function? Probably a newer version that changed the
			// main entry point.
		} catch {
			// ignore
		}

		return globalSnuggery;
	})
	.then(async ({findWorkspace, run}) =>
		run(process.argv.slice(2), {
			startCwd,
			workspace: await findWorkspace(startCwd),
			stdin: process.stdin,
			stdout: process.stdout,
			stderr: process.stderr,
			globalManifest: require.resolve('@snuggery/global/package.json'),
		}),
	)
	.catch(e => {
		process.stderr.write(`Failed to start Snuggery:\n\n${e?.stack ?? e}`);
		return 1;
	})
	.then(returnCode => process.exit(returnCode));

async function findUp(
	names: string | string[],
	from: string,
): Promise<string | null> {
	if (!Array.isArray(names)) {
		names = [names];
	}
	const root = parsePath(from).root;

	let currentDir = from;
	while (currentDir && currentDir !== root) {
		for (const name of names) {
			const p = join(currentDir, name);
			try {
				if ((await fs.stat(p)).isFile()) {
					return p;
				}
			} catch {
				// ignore any error
				// continue to the next filename / folder
			}
		}

		currentDir = dirname(currentDir);
	}

	return null;
}
