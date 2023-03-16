import {createBuilder} from '@snuggery/architect/create-builder';

import {executeBuild} from './executor.js';

export {executeBuild};

export default createBuilder(executeBuild);
