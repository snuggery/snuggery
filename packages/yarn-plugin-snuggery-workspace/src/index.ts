import type {Plugin, Hooks} from '@yarnpkg/core';

import {PackCommand} from './commands/pack';
import {PublishCommand} from './commands/publish';
import {UpCommand} from './commands/up';

const plugin: Plugin<Hooks> = {
  commands:
    process.env.SNUGGERY_YARN === '1'
      ? [PackCommand, PublishCommand, UpCommand]
      : [],
};

export default plugin;
