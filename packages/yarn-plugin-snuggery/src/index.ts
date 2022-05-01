import type {Plugin, Hooks} from '@yarnpkg/core';

import {SnCommand} from './commands/sn';
import {PackCommand} from './commands/snuggery-workspace/pack';
import {PublishCommand} from './commands/snuggery-workspace/publish';
import {UpCommand} from './commands/snuggery-workspace/up';

const plugin: Plugin<Hooks> = {
	commands: [
		SnCommand,
		...(process.env.SNUGGERY_YARN === '1'
			? [PackCommand, PublishCommand, UpCommand]
			: []),
	],
	hooks: {
		setupScriptEnvironment(_project, _env, makePathWrapper) {
			return makePathWrapper('sn', process.execPath, [process.argv[1]!, 'sn']);
		},
	},
};

export default plugin;
