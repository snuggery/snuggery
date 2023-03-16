import type {JsonObject} from '@angular-devkit/core';
import {
	type BuilderContext,
	createBuilder,
} from '@snuggery/architect/create-builder';

import {executeVersion} from './executor';

export type {VersionBuilderOutput} from './yarn';
export {executeVersion};

export default createBuilder(
	async (options: JsonObject, context: BuilderContext) => {
		await executeVersion(options, context);
	},
);
