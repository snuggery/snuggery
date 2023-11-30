import {createBuilder} from "@snuggery/architect";

import {executeBuild} from "./executor";

export {executeBuild};

export default createBuilder(executeBuild);
