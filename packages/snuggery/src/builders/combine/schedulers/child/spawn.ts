import type {BuilderOutput} from '@angular-devkit/architect';
import type {JsonObject} from '@angular-devkit/core';
import {ChildProcess, fork} from 'child_process';
import {Observable, Subscriber} from 'rxjs';

import {
	Child,
	ChildMessage as _ChildMessage,
	ChildMessageType,
	ExecuteBuilderMessage,
	ExecuteTargetMessage,
	Message,
	MessageType,
} from './shared';

export enum SpawnChildMessageType {
	Done = 'done',
}

export type ChildMessage = _ChildMessage | {type: SpawnChildMessageType.Done};

export class SpawnChild extends Child {
	private child?: ChildProcess = undefined;

	private childExited = false;

	private currentObserver?: Subscriber<BuilderOutput> = undefined;

	public destroy(): void {
		if (this.child != null) {
			this.child.kill();
		}
	}

	private getOrCreateChild() {
		if (this.child != null) {
			return this.child;
		}

		const child = fork(require.resolve('./spawned.js'), [this.workspaceRoot]);
		this.child = child;

		child.on('exit', (code, signal) => {
			this.childExited = true;

			if (this.currentObserver != null) {
				if (code || signal) {
					this.currentObserver.error(
						new Error(
							`Process exited with ${
								code ? `code ${code}` : `signal ${signal}`
							}`,
						),
					);
				} else {
					this.currentObserver.complete();
				}
			}
		});

		child.on('error', err => {
			if (this.currentObserver != null) {
				this.currentObserver.error(err);
			}
		});

		child.on('message', (message: ChildMessage) => {
			switch (message.type) {
				case ChildMessageType.Output:
					if (this.currentObserver != null) {
						this.currentObserver.next(message.output);
					}
					break;
				case ChildMessageType.Logging:
					this.logger.next(message.message);
					break;
				case SpawnChildMessageType.Done:
					if (this.currentObserver != null) {
						const {currentObserver} = this;
						this.currentObserver = undefined;
						currentObserver.complete();
					}
					break;
				default:
					if (this.currentObserver != null) {
						this.currentObserver.error(
							new Error(
								`Unknown message type "${(message as {type: string}).type}"`,
							),
						);
					}
			}
		});

		return child;
	}

	private start(message: Message) {
		return new Observable<BuilderOutput>(observer => {
			if (this.currentObserver != null) {
				observer.error(new Error('Child is already working'));
				return;
			}

			if (this.childExited) {
				observer.error(new Error('Child has exited'));
				return;
			}

			this.currentObserver = observer;
			this.getOrCreateChild().send(message);
		});
	}

	public executeTarget(
		target: string,
		extraOptions?: JsonObject,
	): Observable<BuilderOutput> {
		return this.start({
			type: MessageType.ScheduleTarget,
			target,
			extraOptions,
		} as ExecuteTargetMessage);
	}

	public executeBuilder(
		project: string | null,
		builder: string,
		options: JsonObject = {},
		target?: string,
	): Observable<BuilderOutput> {
		return this.start({
			type: MessageType.ScheduleBuilder,
			project,
			builder,
			options,
			target,
		} as ExecuteBuilderMessage);
	}
}
