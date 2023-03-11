import {createTextFileHandle, type WorkspaceHost} from '../file';
import type {MiniWorkspaceOptions} from '../mini';
import type {WorkspaceHandle} from '../types';

import {createFileHandle, knownExtensions} from './file';
import {MiniWorkspaceHandle} from './workspace-handle/mini';

export async function createSplitMiniWorkspaceHandle(
	source: WorkspaceHost,
	path: string,
	options: MiniWorkspaceOptions,
): Promise<WorkspaceHandle> {
	const fileType = createFileHandle(
		await createTextFileHandle(
			source,
			path,
			Array.from(options.basename).flatMap(basename =>
				knownExtensions.map(ext => `${basename}${ext}`),
			),
		),
		path,
	);

	return new MiniWorkspaceHandle(fileType, options.targets);
}
