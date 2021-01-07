import {
  BuilderOutput,
  BuilderRun,
  targetFromTargetString,
} from '@angular-devkit/architect';
import type {JsonObject} from '@angular-devkit/core';
import {
  resolveTargetString,
  TargetSpecifier,
} from '@bgotink/atelier/builder-utils';
import {defer, Observable} from 'rxjs';
import {switchMap} from 'rxjs/operators';

import {RegularScheduler} from './abstract';

export class InProcessScheduler extends RegularScheduler {
  public runSingleTarget(
    targetSpec: TargetSpecifier,
    extraOptions?: JsonObject | undefined,
  ): Observable<BuilderOutput> {
    let scheduled: Observable<BuilderRun>;

    if (typeof targetSpec === 'string') {
      const target = targetFromTargetString(
        resolveTargetString(this.context, targetSpec),
      );

      scheduled = defer(() =>
        this.context.scheduleTarget(target, extraOptions, {target}),
      );
    } else {
      const target = this.getTarget(targetSpec.project);

      scheduled = defer(() =>
        this.context.scheduleBuilder(
          targetSpec.builder,
          {...targetSpec.options, ...extraOptions},
          {target},
        ),
      );
    }

    return scheduled.pipe(switchMap(result => result.result));
  }
}
