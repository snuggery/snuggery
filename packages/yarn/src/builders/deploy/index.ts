import {createBuilder} from '@angular-devkit/architect';

import {executeDeploy} from './executor';

export {executeDeploy};

export default createBuilder(executeDeploy);
