/* eslint-disable @typescript-eslint/explicit-module-boundary-types */

import type {Plugin, Hooks} from '@yarnpkg/core';

import {SnCommand} from './commands/sn';

const plugin: Plugin<Hooks> = {
  commands: [SnCommand],
  hooks: {
    setupScriptEnvironment(_project, _env, makePathWrapper) {
      return makePathWrapper('sn', process.execPath, [process.argv[1]!, 'sn']);
    },
  },
};

export default plugin;
