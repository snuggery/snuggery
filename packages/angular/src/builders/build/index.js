import {createBuilder} from '@angular-devkit/architect';

import {executeBuild} from './executor.js';

export {executeBuild};

export default createBuilder(executeBuild);
