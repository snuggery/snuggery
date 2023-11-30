import type {TextFileHandle} from "../file";
import type {WorkspaceHandle} from "../types";

export interface CombinedWorkspaceHandleFactory {
	new (fileHandle: TextFileHandle): WorkspaceHandle;
}
