import type {logging} from '@angular-devkit/core';
import type {BuilderOutput} from '@snuggery/architect';
import type {JsonObject} from '@snuggery/core';
import type {Observable} from 'rxjs';

export enum MessageType {
	ScheduleTarget = 'scheduleTarget',
	ScheduleBuilder = 'scheduleBuilder',
}

export interface ExecuteTargetMessage {
	type: MessageType.ScheduleTarget;
	target: string;
	extraOptions?: JsonObject;
}

export interface ExecuteBuilderMessage {
	type: MessageType.ScheduleBuilder;
	project: string | null;
	builder: string;
	options: JsonObject;
	target?: string;
}

export type Message = ExecuteTargetMessage | ExecuteBuilderMessage;

export enum ChildMessageType {
	Output = 'output',
	Logging = 'logging',
}

export interface ChildBuilderOutputMessage {
	type: ChildMessageType.Output;
	output: BuilderOutput;
}

export interface ChildLoggingMessage {
	type: ChildMessageType.Logging;
	message: logging.LogEntry;
}

export type ChildMessage = ChildBuilderOutputMessage | ChildLoggingMessage;

export abstract class Child {
	public constructor(
		protected readonly workspaceRoot: string,
		protected readonly logger: logging.Logger,
	) {}

	public abstract destroy(): void;

	public abstract executeTarget(
		target: string,
		extraOptions?: JsonObject,
	): Observable<BuilderOutput>;

	public abstract executeBuilder(
		project: string | null,
		builder: string,
		options?: JsonObject,
		target?: string,
	): Observable<BuilderOutput>;
}
