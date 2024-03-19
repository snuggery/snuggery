import {ChildScheduler} from "./abstract.js";
import type {Child} from "./child/shared.js";
import {WorkerChild} from "./child/worker.js";

export class WorkerScheduler extends ChildScheduler {
	protected createChild(): Child {
		return new WorkerChild(
			this.context.workspaceRoot,
			this.context.logger.createChild(""),
		);
	}
}
