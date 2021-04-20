import type {Plugin, Hooks} from '@yarnpkg/core';

import {PackCommand} from './commands/pack';
import {PublishCommand} from './commands/publish';

const plugin: Plugin<Hooks> = {
  commands:
    process.env.SNUGGERY_YARN === '1' ? [PackCommand, PublishCommand] : [],
};

export default plugin;
