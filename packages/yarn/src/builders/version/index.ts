import {createBuilder} from '@angular-devkit/architect';

import {executeVersion} from './executor';

export {VersionBuilderOutput} from './yarn';
export {executeVersion};

export default createBuilder(executeVersion);
