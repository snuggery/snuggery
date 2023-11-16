import {createBuilder} from '@snuggery/architect';

import {executeBuild} from './executor.js';

export {executeBuild};

export default createBuilder(executeBuild);
