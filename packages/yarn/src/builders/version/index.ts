import {BuilderContext, createBuilder} from '@angular-devkit/architect';
import type {JsonObject} from '@angular-devkit/core';
import {mapSuccessfulResult} from '@snuggery/architect/operators';

import {executeVersion} from './executor';

export type {VersionBuilderOutput} from './yarn';
export {executeVersion};

export default createBuilder((options: JsonObject, context: BuilderContext) =>
	executeVersion(options, context).pipe(
		mapSuccessfulResult(({success}) => ({success})),
	),
);
