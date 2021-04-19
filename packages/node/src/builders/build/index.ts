import {createBuilder} from '@angular-devkit/architect';

import {executeBuild} from './executor';

export {executeBuild};

export default createBuilder(executeBuild);
