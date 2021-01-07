import {ChildScheduler} from './abstract';
import type {Child} from './child/shared';
import {WorkerChild} from './child/worker';

export class WorkerScheduler extends ChildScheduler {
  protected createChild(): Child {
    return new WorkerChild(
      this.context.workspaceRoot,
      this.context.logger.createChild(''),
    );
  }
}
