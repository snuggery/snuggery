import type {WorkspaceHandle} from '../../types';
import type {FileHandle} from '../file';

export interface WorkspaceHandleFactory {
	new (file: FileHandle): WorkspaceHandle;
}
