import {suite} from 'uvu';

import {AngularWorkspaceHandle} from '../angular';

import {itShouldHandleAngularConfiguration} from './utils';

const test = suite('AngularWorkspaceHandle');

itShouldHandleAngularConfiguration(test, AngularWorkspaceHandle);

test.run();
