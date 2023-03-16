import {
	type BuilderContext,
	BuildFailureError,
} from '@snuggery/architect/create-builder';

import {scheduleTarget} from './run';
import {firstValueFrom} from './rxjs';

export async function runPackager(
	context: BuilderContext,
	{packager, directory}: {packager?: string; directory: string},
): Promise<void> {
	if (!packager) {
		return;
	}

	const packageBuilder = packager.includes(':') ? packager : `${packager}:pack`;

	const result = await firstValueFrom(
		context,
		scheduleTarget(
			{
				builder: packageBuilder,
			},
			{directory},
			context,
		),
	);

	if (!result.success) {
		throw new BuildFailureError(result.error);
	}
}
