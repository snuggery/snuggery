import {BuilderOutput, targetStringFromTarget} from '@angular-devkit/architect';
import type {JsonObject} from '@angular-devkit/core';
import {resolveTargetString, TargetSpecifier} from '@snuggery/architect';
import type {Observable} from 'rxjs';
import {finalize} from 'rxjs/operators';

import {RegularScheduler} from './abstract';
import {SpawnChild} from './child/spawn';

export class RespawnScheduler extends RegularScheduler {
	public runSingleTarget(
		targetSpec: TargetSpecifier,
		extraOptions?: JsonObject | undefined,
	): Observable<BuilderOutput> {
		let scheduled: Observable<BuilderOutput>;
		const child = new SpawnChild(
			this.context.workspaceRoot,
			this.context.logger.createChild(''),
		);

		if (typeof targetSpec === 'string') {
			const target = resolveTargetString(this.context, targetSpec);

			scheduled = child.executeTarget(target, extraOptions);
		} else {
			const target = this.getTarget(targetSpec.project);

			scheduled = child.executeBuilder(
				targetSpec.project ?? this.currentProject,
				targetSpec.builder,
				{...targetSpec.options, ...extraOptions},
				target != null ? targetStringFromTarget(target) : undefined,
			);
		}

		return scheduled.pipe(finalize(() => child.destroy()));
	}
}
