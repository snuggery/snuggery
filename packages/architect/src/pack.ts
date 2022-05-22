import type {BuilderContext, BuilderOutput} from '@angular-devkit/architect';
import {take} from 'rxjs/operators';

import {scheduleTarget} from './run';

export async function runPackager(
	context: BuilderContext,
	{packager, directory}: {packager?: string; directory: string},
): Promise<BuilderOutput> {
	if (!packager) {
		return {success: true};
	}

	const packageBuilder = packager.includes(':') ? packager : `${packager}:pack`;

	return await scheduleTarget(
		{
			builder: packageBuilder,
		},
		{directory},
		context,
	)
		.pipe(take(1))
		.toPromise()!;
}
