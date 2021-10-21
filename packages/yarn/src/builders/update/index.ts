import {createBuilder} from '@angular-devkit/architect';

import {executeUpdate} from './executor';

export {executeUpdate};

export default createBuilder(executeUpdate);
