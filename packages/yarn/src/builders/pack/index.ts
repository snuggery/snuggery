import {createBuilder} from '@snuggery/architect/create-builder';

import {executePack} from './executor';

export {executePack};

export default createBuilder(executePack);
