import {createBuilder} from '@snuggery/architect/create-builder';

import {executeBuild} from './executor';

export {executeBuild};

export default createBuilder(executeBuild);
