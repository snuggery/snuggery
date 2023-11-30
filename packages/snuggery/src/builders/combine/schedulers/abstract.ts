import {
	type Target as ArchitectTarget,
	targetStringFromTarget,
} from "@angular-devkit/architect";
import {
	type BuilderContext,
	type BuilderOutput,
	TransientTarget,
	resolveTargetString,
	TargetSpecifier,
} from "@snuggery/architect";
import type {JsonObject} from "@snuggery/core";
import {concat, merge, Observable} from "rxjs";
import {finalize} from "rxjs/operators";

import {calculate} from "../calculator";
import type {ParallelTarget, SerialTarget, Target} from "../schema";
import {Type} from "../types";

import type {Child} from "./child/shared";

export function isSingleTarget(target: Target): target is TargetSpecifier {
	return (
		typeof target === "string" ||
		(target != null && (target as TransientTarget).builder != null)
	);
}

export abstract class Scheduler {
	public constructor(protected readonly context: BuilderContext) {}

	protected getTarget(projectOverride?: string): ArchitectTarget | undefined {
		return projectOverride
			? ({...this.context.target, project: projectOverride} as ArchitectTarget)
			: this.context.target;
	}

	protected get currentProject(): string | null {
		return this.context.target?.project ?? null;
	}

	public abstract run(
		target: Target,
		extraOptions?: JsonObject,
	): Observable<BuilderOutput>;
}

/**
 * Regular scheduler implementation
 */
export abstract class RegularScheduler extends Scheduler {
	public run(
		target: Target,
		extraOptions?: JsonObject,
	): Observable<BuilderOutput> {
		if (isSingleTarget(target)) {
			return this.runSingleTarget(target, extraOptions);
		} else if (target.type === Type.Parallel) {
			return this.runParallelTargets(target, extraOptions);
		} else {
			return this.runSerialTargets(target, extraOptions);
		}
	}

	public runParallelTargets(
		parallelTarget: ParallelTarget,
		extraOptions?: JsonObject,
	): Observable<BuilderOutput> {
		const targets = parallelTarget.targets.map((target) =>
			this.run(target, extraOptions),
		);

		if (parallelTarget.maxParallel != null) {
			return merge(...targets, calculate(parallelTarget.maxParallel));
		} else {
			return merge(...targets);
		}
	}

	public runSerialTargets(
		serialTarget: SerialTarget,
		extraOptions?: JsonObject,
	): Observable<BuilderOutput> {
		return concat(
			...serialTarget.targets.map((target) => this.run(target, extraOptions)),
		);
	}

	public abstract runSingleTarget(
		targetSpec: TargetSpecifier,
		extraOptions?: JsonObject | undefined,
	): Observable<BuilderOutput>;
}

/**
 * Scheduler that spawns children to be reused for executing multiple targets
 */
export abstract class ChildScheduler extends Scheduler {
	protected abstract createChild(): Child;

	public run(
		target: Target,
		extraOptions?: JsonObject | undefined,
		child?: Child,
	): Observable<BuilderOutput> {
		let destroyChild = false;
		if (child == null) {
			child = this.createChild();
			destroyChild = true;
		}

		let obs: Observable<BuilderOutput>;

		if (isSingleTarget(target)) {
			obs = this.runSingleTarget(target, extraOptions, child);
		} else if (target.type === Type.Parallel) {
			obs = this.runParallelTargets(target, extraOptions, child);
		} else {
			obs = this.runSerialTargets(target, extraOptions, child);
		}

		if (destroyChild) {
			return obs.pipe(finalize(() => child!.destroy()));
		} else {
			return obs;
		}
	}

	public runParallelTargets(
		parallelTarget: ParallelTarget,
		extraOptions: JsonObject | undefined,
		child: Child,
	): Observable<BuilderOutput> {
		return new Observable((observer) => {
			const poolSize = calculate(
				parallelTarget.maxParallel || parallelTarget.targets.length,
			);

			const children = new Set(
				Array.from({length: poolSize - 1}, () => this.createChild()),
			);
			children.add(child);

			const targetsToDo = [...parallelTarget.targets];

			observer.add(() => {
				for (const child of children) {
					child.destroy();
				}
			});

			const pop = (child: Child) => {
				if (targetsToDo.length === 0) {
					child.destroy();
					children.delete(child);

					if (children.size === 0) {
						observer.complete();
					}

					return;
				}

				const target = targetsToDo.shift()!;

				observer.add(
					this.run(target, extraOptions, child).subscribe({
						next: (value) => observer.next(value),
						error: (err) => observer.error(err),
						complete: () => pop(child),
					}),
				);
			};

			for (const child of children) {
				pop(child);
			}
		});
	}

	public runSerialTargets(
		serialTarget: SerialTarget,
		extraOptions: JsonObject | undefined,
		child: Child,
	): Observable<BuilderOutput> {
		return concat(
			...serialTarget.targets.map((target) =>
				this.run(target, extraOptions, child),
			),
		);
	}

	public runSingleTarget(
		targetSpec: TargetSpecifier,
		extraOptions: JsonObject | undefined,
		child: Child,
	): Observable<BuilderOutput> {
		if (typeof targetSpec === "string") {
			const target = resolveTargetString(this.context, targetSpec);

			return child.executeTarget(target, extraOptions);
		} else {
			const target = this.getTarget(targetSpec.project);

			return child.executeBuilder(
				targetSpec.project ?? this.currentProject,
				targetSpec.builder,
				{...targetSpec.options, ...extraOptions},
				target != null ? targetStringFromTarget(target) : undefined,
			);
		}
	}
}
