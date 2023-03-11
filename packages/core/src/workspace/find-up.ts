import {join, dirname, parse as parsePath} from 'node:path';

import type {WorkspaceHost} from './file';
import {nodeFsHost} from './node';

export async function findUp(
	names: string | readonly string[],
	from: string,
	{host = nodeFsHost}: {host?: WorkspaceHost} = {},
): Promise<string | null> {
	if (!Array.isArray(names)) {
		names = [names as string];
	}
	const root = parsePath(from).root;

	let currentDir = from;
	while (currentDir && currentDir !== root) {
		for (const name of names) {
			const p = join(currentDir, name);
			try {
				if (await host.isFile(p)) {
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
