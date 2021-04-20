import {createBuilder} from '@angular-devkit/architect';

import {executePack} from './executor';

export {executePack};

export default createBuilder(executePack);
