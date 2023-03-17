import {getProjectPath} from '@snuggery/architect';
import type {BuilderContext} from '@snuggery/architect/create-builder';
import {createRequire} from 'node:module';
import path from 'node:path';
import {parse} from 'uvu/parse';
import {run} from 'uvu/run';

import type {Schema} from './schema';

export async function execute(
	input: Schema,
	context: BuilderContext,
): Promise<void> {
	if (input.require?.length) {
		const projectRequire = createRequire(
			path.join(await getProjectPath(context), '<test>'),
		);
		const workspaceRequire = createRequire(
			path.join(context.workspaceRoot, '<test>'),
		);
		// eslint-disable-next-line no-inner-declarations
		function require(path: string) {
			try {
				try {
					path = projectRequire.resolve(path);
				} catch {
					path = workspaceRequire.resolve(path);
				}
			} catch {
				path = workspaceRequire.resolve(`./${path}`);
			}

			workspaceRequire(path);
		}

		if (typeof input.require === 'string') {
			require(input.require);
		} else {
			for (const r of input.require) {
				require(r);
			}
		}
	}

	const {suites} = await parse(input.dir, input.pattern, {
		cwd: input.dir ? context.workspaceRoot : await getProjectPath(context),
		ignore: input.ignore?.length ? input.ignore : undefined,
	});

	await run(suites, {bail: input.bail ?? true});
}
