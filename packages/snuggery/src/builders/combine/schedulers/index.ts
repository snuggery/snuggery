import type {BuilderContext} from '@angular-devkit/architect';

import {SchedulerType} from '../types';

import type {Scheduler} from './abstract';
import {InProcessScheduler} from './in-process';
import {RespawnScheduler} from './respawn';
import {SpawnScheduler} from './spawn';
import {WorkerScheduler} from './worker';

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
