import {
	type BuilderOutput,
	scheduleTarget,
	type TargetSpecifier,
} from "@snuggery/architect";
import type {JsonObject} from "@snuggery/core";
import type {Observable} from "rxjs";

import {RegularScheduler} from "./abstract.js";

export class InProcessScheduler extends RegularScheduler {
	public runSingleTarget(
		targetSpec: TargetSpecifier,
		extraOptions: JsonObject = {},
	): Observable<BuilderOutput> {
		return scheduleTarget(targetSpec, extraOptions, this.context);
	}
}
