import type {BuilderOutput} from '@angular-devkit/architect';
import type {JsonObject, logging} from '@angular-devkit/core';
import {Observable} from 'rxjs';
import {MessageChannel, MessagePort, Worker} from 'worker_threads';

import {
  Child,
  ChildMessage,
  ChildMessageType,
  ExecuteBuilderMessage as _ExecuteBuilderMessage,
  ExecuteTargetMessage as _ExecuteTargetMessage,
  MessageType,
} from './shared';

export interface ExecuteTargetMessage extends _ExecuteTargetMessage {
  port: MessagePort;
}

export interface ExecuteBuilderMessage extends _ExecuteBuilderMessage {
  port: MessagePort;
}

export type Message = ExecuteBuilderMessage | ExecuteTargetMessage;

function messagesToObservable(
  logger: logging.Logger,
  createPort: () => MessagePort,
): Observable<BuilderOutput> {
  return new Observable(observer => {
    const port = createPort();

    port.on('close', () => observer.complete());
    port.on('message', (message: ChildMessage) => {
      switch (message.type) {
        case ChildMessageType.Output:
          observer.next(message.output);
          break;
        case ChildMessageType.Logging:
          logger.next(message.message);
          break;
        default:
          observer.error(
            new Error(
              `Unknown message type "${(message as ChildMessage).type}"`,
            ),
          );
      }
    });
  });
}

export class WorkerChild extends Child {
  private readonly thread: Worker;

  public constructor(workspaceRoot: string, logger: logging.Logger) {
    super(workspaceRoot, logger);

    this.thread = new Worker(require.resolve('./worked.js'), {
      workerData: {workspaceRoot},
    });
  }

  public destroy(): void {
    void this.thread.terminate();
  }

  public executeTarget(
    target: string,
    extraOptions?: JsonObject,
  ): Observable<BuilderOutput> {
    return messagesToObservable(this.logger, () => {
      const {port1, port2} = new MessageChannel();

      this.thread.postMessage(
        {
          type: MessageType.ScheduleTarget,
          target,
          extraOptions,
          port: port1,
        } as ExecuteTargetMessage,
        [port1],
      );

      return port2;
    });
  }

  public executeBuilder(
    project: string | null,
    builder: string,
    options: JsonObject = {},
    target?: string,
  ): Observable<BuilderOutput> {
    return messagesToObservable(this.logger, () => {
      const {port1, port2} = new MessageChannel();

      this.thread.postMessage(
        {
          type: MessageType.ScheduleBuilder,
          project,
          builder,
          options,
          target,
          port: port1,
        } as ExecuteBuilderMessage,
        [port1],
      );

      return port2;
    });
  }
}
