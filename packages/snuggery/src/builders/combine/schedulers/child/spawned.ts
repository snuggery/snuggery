import {logging} from '@angular-devkit/core';
import type {BuilderOutput} from '@snuggery/architect';
import type {Observable} from 'rxjs';

import {ChildArchitect} from './architect';
import {
	ChildBuilderOutputMessage,
	ChildLoggingMessage,
	ChildMessageType,
	Message,
	MessageType,
} from './shared';
import {ChildMessage, SpawnChildMessageType} from './spawn';

const workspaceRoot = process.argv[2]!;

if (process.send == null) {
	process.exitCode = 1;
	throw new Error(`Don't import ${__filename}, fork it`);
}

const architect = new ChildArchitect(workspaceRoot);

process.on('message', (message: Message) => {
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
			throw new Error(
				`Invalid message type: "${(message as {type: string}).type}"`,
			);
	}

	logger.subscribe((logMessage) => {
		process.send!({
			type: ChildMessageType.Logging,
			message: logMessage,
		} as ChildLoggingMessage);
	});

	obs.subscribe({
		next: (output) =>
			process.send!({
				type: ChildMessageType.Output,
				output,
			} as ChildBuilderOutputMessage),
		complete: () =>
			process.send!({type: SpawnChildMessageType.Done} as ChildMessage),
	});
});
