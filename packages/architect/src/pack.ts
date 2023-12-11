import {isJsonObject} from "@snuggery/core";

import {BuildFailureError, type BuilderContext} from "./create-builder";
import {scheduleTarget} from "./run";
import {firstValueFrom} from "./rxjs";
import {findWorkspace} from "./workspace";

export async function runPackager(
	context: BuilderContext,
	{packager, directory}: {packager?: string; directory: string},
): Promise<void> {
	if (!packager) {
		const workspace = await findWorkspace(context);

		if (
			!isJsonObject(workspace.extensions.cli) ||
			typeof workspace.extensions.cli.packageManager !== "string"
		) {
			throw new BuildFailureError(
				`No package manager configured, either pass a packager package as string or configure cli.packageManager in your workspace configuration file`,
			);
		}

		packager = `@snuggery/${workspace.extensions.cli.packageManager}`;
	}

	const packageBuilder = packager.includes(":") ? packager : `${packager}:pack`;

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
