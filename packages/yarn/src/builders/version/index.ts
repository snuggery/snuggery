import {createBuilder} from '@snuggery/architect';

import {executeVersion} from './executor';

export type {VersionBuilderOutput} from './yarn';
export {executeVersion};

export default createBuilder(async (options, context) => {
	await executeVersion(options, context);
});
