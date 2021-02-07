import {ChildScheduler} from './abstract';
import type {Child} from './child/shared';
import {SpawnChild} from './child/spawn';

export class SpawnScheduler extends ChildScheduler {
  protected createChild(): Child {
    return new SpawnChild(
      this.context.workspaceRoot,
      this.context.logger.createChild(''),
    );
  }
}
