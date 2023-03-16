import {createBuilder} from '@snuggery/architect/create-builder';

import {executeDeploy} from './executor';

export {executeDeploy};

export default createBuilder(executeDeploy);
