import {createBuilder} from "@snuggery/architect";

import {executeDeploy} from "./executor";

export {executeDeploy};

export default createBuilder(executeDeploy);
