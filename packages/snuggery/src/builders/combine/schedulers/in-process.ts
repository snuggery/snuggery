import type {BuilderOutput} from '@angular-devkit/architect';
import {scheduleTarget, TargetSpecifier} from '@snuggery/architect';
import type {JsonObject} from '@snuggery/core';
import type {Observable} from 'rxjs';

import {RegularScheduler} from './abstract';

export class InProcessScheduler extends RegularScheduler {
	public runSingleTarget(
		targetSpec: TargetSpecifier,
		extraOptions: JsonObject = {},
	): Observable<BuilderOutput> {
		return scheduleTarget(targetSpec, extraOptions, this.context);
	}
}
