import {
	Architect,
	BuilderOutput,
	targetFromTargetString,
} from '@angular-devkit/architect';
import {logging, schema} from '@angular-devkit/core';
import type {JsonObject} from '@snuggery/core';
import {
	createArchitectHost,
	CliWorkspace,
	findWorkspace,
} from '@snuggery/snuggery/cli';
import {forkJoin, from, Observable} from 'rxjs';
import {finalize, map, mergeMap, switchMap} from 'rxjs/operators';

export class ChildArchitect {
	readonly #architect: Promise<Architect>;

	readonly #workspace: Promise<CliWorkspace>;

	public constructor(workspaceRoot: string) {
		const registry = new schema.CoreSchemaRegistry();
		registry.addPostTransform(schema.transforms.addUndefinedDefaults);

		const workspace = findWorkspace(workspaceRoot) as Promise<CliWorkspace>;
		this.#workspace = workspace;

		this.#architect = workspace.then(
			workspace =>
				new Architect(
					createArchitectHost({startCwd: process.cwd()}, workspace),
					registry,
				),
		);
	}

	public executeTarget(
		target: string,
		extraOptions: JsonObject | undefined,
		logger: logging.Logger,
	): Observable<BuilderOutput> {
		return from(this.#architect).pipe(
			mergeMap(architect =>
				architect.scheduleTarget(targetFromTargetString(target), extraOptions, {
					logger,
				}),
			),
			switchMap(run => run.output.pipe(finalize(() => run.stop()))),
		);
	}

	public executeBuilder(
		project: string | null,
		builder: string,
		options: JsonObject = {},
		logger: logging.Logger,
	): Observable<BuilderOutput> {
		return forkJoin([
			this.#architect,
			from(this.#workspace).pipe(
				map(workspace => workspace.makeSyntheticTarget(project, builder)),
			),
		]).pipe(
			switchMap(([architect, target]) =>
				architect.scheduleTarget(target, options, {logger}),
			),
			switchMap(run => run.output.pipe(finalize(() => run.stop()))),
		);
	}
}
