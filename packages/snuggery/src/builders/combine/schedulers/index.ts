import type {BuilderContext} from "@snuggery/architect";

import {SchedulerType} from "../types.js";

import type {Scheduler} from "./abstract.js";
import {InProcessScheduler} from "./in-process.js";
import {RespawnScheduler} from "./respawn.js";
import {SpawnScheduler} from "./spawn.js";
import {WorkerScheduler} from "./worker.js";

export function createScheduler(
	schedulerType: SchedulerType | undefined,
	context: BuilderContext,
): Scheduler {
	switch (schedulerType ?? SchedulerType.InProcess) {
		case SchedulerType.InProcess:
			return new InProcessScheduler(context);
		case SchedulerType.Spawn:
			return new SpawnScheduler(context);
		case SchedulerType.Worker:
			return new WorkerScheduler(context);
		case SchedulerType.Respawn:
			return new RespawnScheduler(context);
		default:
			throw new Error(`Unknown scheduler: "${schedulerType}"`);
	}
}
