import type {BuilderOutput} from '@angular-devkit/architect';
import {logging} from '@angular-devkit/core';
import type {Observable} from 'rxjs';
import {isMainThread, parentPort, workerData} from 'worker_threads';

import {ChildArchitect} from './architect';
import {
  ChildBuilderOutputMessage,
  ChildLoggingMessage,
  ChildMessageType,
  MessageType,
} from './shared';
import type {Message} from './worker';

if (isMainThread) {
  throw new Error(`Don't import ${__filename}, load it via a worker thread`);
}

const architect = new ChildArchitect(workerData.workspaceRoot);

parentPort!.on('message', (message: Message) => {
  let obs: Observable<BuilderOutput>;

  const logger = new logging.Logger('child');

  switch (message.type) {
    case MessageType.ScheduleBuilder:
      obs = architect.executeBuilder(
        message.project,
        message.builder,
        message.options,
        logger,
      );
      break;
    case MessageType.ScheduleTarget:
      obs = architect.executeTarget(
        message.target,
        message.extraOptions,
        logger,
      );
      break;
    default:
      throw new Error(`Invalid message type: "${(message as Message).type}"`);
  }

  logger.subscribe(logMessage => {
    message.port.postMessage({
      type: ChildMessageType.Logging,
      message: logMessage,
    } as ChildLoggingMessage);
  });

  obs.subscribe({
    next: output =>
      message.port.postMessage({
        type: ChildMessageType.Output,
        output,
      } as ChildBuilderOutputMessage),
    complete: () => message.port.close(),
  });
});
