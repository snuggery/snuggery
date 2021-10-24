import {
	BuilderContext,
	BuilderHandlerFn,
	createBuilder,
} from '@angular-devkit/architect';
import type {JsonObject} from '@angular-devkit/core';
import type {
	Rule,
	RuleFactory,
	TaskConfiguration,
	TaskConfigurationGenerator,
	TaskExecutor,
	TaskExecutorFactory,
	Tree as NgTree,
} from '@angular-devkit/schematics';
import type {FileSystemEngineHostBase} from '@angular-devkit/schematics/tools';
import type {
	Tree as NxTree,
	ProjectConfiguration,
	TargetConfiguration,
	ExecutorContext,
	Executor,
	FileChange,
	Generator,
	WorkspaceJsonConfiguration,
} from '@nrwl/devkit';
import type {ErrorWithMeta} from 'clipanion';

import {AbstractError} from '../../utils/error';
import type {CliWorkspace} from '../command/context';

import {Cached} from './decorator';

export {Executor, Generator};

function isAsyncIterable(value: unknown): value is AsyncIterable<unknown> {
	return value != null && Symbol.asyncIterator in (value as object);
}

function extractResult(
	value: ReturnType<Executor>,
): ReturnType<BuilderHandlerFn<JsonObject>> {
	// @nrwl/devkit declares that an executor returns a promise or async iterable that emits items of
	// interface {success: boolean}, but they can't actually enforce this as they lack an equivalent
	// to `createBuilder`.
	// Therefore we must default `success` to a value, and `true` seems to be the most logical choice,
	// as an executor that returns Promise<void> can only convey "it failed" by throwing an error.

	if (!isAsyncIterable(value)) {
		// Use Promise.resolve here because again, the return type of an executor isn't validated, so
		// executors can potentially return anything they want, e.g. void

		// @ts-expect-error see above
		return Promise.resolve(value).then(v => ({success: true, ...v}));
	}

	return (async function* () {
		for await (const item of value) {
			// @ts-expect-error see above
			yield {success: true, ...item};
		}
	})();
}

export class InvalidExecutorError
	extends AbstractError
	implements ErrorWithMeta
{
	readonly clipanion = {type: 'none'} as const;
}

class MappedContext implements ExecutorContext {
	constructor(
		private readonly snuggeryWorkspace: CliWorkspace | null,
		private readonly ngContext: BuilderContext,
	) {}

	get root() {
		return this.ngContext.workspaceRoot;
	}

	get projectName() {
		return this.ngContext.target?.project;
	}

	@Cached()
	get target(): TargetConfiguration {
		if (this.ngContext.target == null) {
			return {
				executor: this.ngContext.builder.builderName,
			};
		}

		const target = this.snuggeryWorkspace?.projects
			.get(this.ngContext.target.project)
			?.targets.get(this.ngContext.target.target);

		return {
			executor: this.ngContext.builder.builderName,
			options: target?.options,
			configurations: target?.configurations,
		};
	}

	@Cached()
	get workspace(): WorkspaceJsonConfiguration {
		/* eslint-disable @typescript-eslint/no-explicit-any */
		return {
			version: 2,
			projects: Object.fromEntries(
				Array.from(
					this.snuggeryWorkspace?.projects ?? [],
					([projectName, project]): [string, ProjectConfiguration] => {
						return [
							projectName,
							{
								targets: Object.fromEntries(
									Array.from(
										project.targets,
										([targetName, {builder, configurations, options}]): [
											string,
											TargetConfiguration,
										] => {
											return [
												targetName,
												{
													executor: builder,
													configurations,
													options,
												},
											];
										},
									),
								),

								root: project.root,
								generators: project.extensions.schematics as any,
								projectType: project.extensions.projectType as
									| 'library'
									| 'application',
								sourceRoot: project.sourceRoot,
							},
						];
					},
				),
			),

			defaultProject: this.workspace?.defaultProject ?? undefined,
			cli: this.snuggeryWorkspace?.extensions.cli as any,
			generators: this.snuggeryWorkspace?.extensions.schematics as any,
		};
		/* eslint-enable @typescript-eslint/no-explicit-any */
	}

	get cwd(): string {
		return this.ngContext.currentDirectory;
	}

	get isVerbose(): boolean {
		return false;
	}
}

export function makeExecutorIntoBuilder(
	executor: Executor,
	workspace: CliWorkspace | null,
): ReturnType<typeof createBuilder> {
	return createBuilder((options, context) => {
		return extractResult(
			executor(options, new MappedContext(workspace, context)),
		);
	});
}

class MappedTree implements NxTree {
	constructor(private readonly tree: NgTree, readonly root: string) {}
	changePermissions(): void {
		throw new Error('Method not implemented.');
	}

	read(filePath: string): Buffer | null;
	read(filePath: string, encoding: BufferEncoding): string | null;
	read(filePath: string, encoding?: BufferEncoding): Buffer | string | null {
		const buffer = this.tree.read(filePath);
		return encoding != null && buffer != null
			? buffer.toString(encoding)
			: buffer;
	}

	write(filePath: string, content: string | Buffer): void {
		if (this.tree.exists(filePath)) {
			return this.tree.overwrite(filePath, content);
		} else {
			return this.tree.create(filePath, content);
		}
	}

	exists(filePath: string): boolean {
		return this.tree.exists(filePath) || this.children(filePath).length > 0;
	}

	delete(filePath: string): void {
		return this.tree.delete(filePath);
	}

	rename(from: string, to: string): void {
		return this.tree.rename(from, to);
	}

	isFile(filePath: string): boolean {
		return this.tree.exists(filePath);
	}

	children(dirPath: string): string[] {
		const dirEntry = this.tree.getDir(dirPath);
		return [...dirEntry.subdirs, ...dirEntry.subfiles];
	}

	listChanges(): FileChange[] {
		const typeMap = {
			c: 'CREATE',
			o: 'UPDATE',
			d: 'DELETE',
			r: 'UPDATE',
		} as const;

		return this.tree.actions.flatMap(action => {
			if (action.kind === 'r') {
				return [
					{
						path: action.path,
						type: 'DELETE',
						content: null,
					},
					{
						path: action.to,
						type: 'CREATE',
						content: this.read(action.to),
					},
				];
			}

			return {
				path: action.path,
				type: typeMap[action.kind],
				content: action.kind === 'd' ? null : action.content,
			};
		});
	}
}

interface ExecuteAfterSchematicOptions {
	task?: () => void | Promise<void>;
}

class ExecuteAfterSchematicTask
	implements TaskConfigurationGenerator<ExecuteAfterSchematicOptions>
{
	constructor(private readonly task: () => void | Promise<void>) {}

	toConfiguration(): TaskConfiguration<ExecuteAfterSchematicOptions> {
		return {
			name: 'executeNxTaskAfterSchematic',
			options: {task: this.task},
		};
	}
}

const executeAfterSchematicTaskFactory: TaskExecutorFactory<void> = {
	name: 'executeNxTaskAfterSchematic',

	async create(): Promise<TaskExecutor<ExecuteAfterSchematicOptions>> {
		return async ({task}: ExecuteAfterSchematicOptions = {}) => {
			await task?.();
		};
	},
};

export function makeGeneratorIntoSchematic(
	generator: Generator,
	root: string,
	engineHost: Pick<
		FileSystemEngineHostBase,
		'hasTaskExecutor' | 'registerTaskExecutor'
	>,
): RuleFactory<JsonObject> {
	return (options: JsonObject): Rule =>
		async (tree, context) => {
			const task = await generator(new MappedTree(tree, root), options);

			if (task != null) {
				if (
					!engineHost.hasTaskExecutor(executeAfterSchematicTaskFactory.name)
				) {
					engineHost.registerTaskExecutor(executeAfterSchematicTaskFactory);
				}

				context.addTask(new ExecuteAfterSchematicTask(() => task()));
			}
		};
}
