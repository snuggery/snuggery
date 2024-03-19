import {ChildScheduler} from "./abstract.js";
import type {Child} from "./child/shared.js";
import {SpawnChild} from "./child/spawn.js";

export class SpawnScheduler extends ChildScheduler {
	protected createChild(): Child {
		return new SpawnChild(
			this.context.workspaceRoot,
			this.context.logger.createChild(""),
		);
	}
}
