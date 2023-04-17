import {
	type BuilderContext,
	extractExtraConfiguration,
	findWorkspace,
} from '@snuggery/architect';
import {
	JsonObject,
	isJsonObject,
	WorkspaceDefinition,
	JsonValue,
} from '@snuggery/core';
import {createRequire} from 'module';
import {join} from 'path';
import * as t from 'typanion';
import {pathToFileURL} from 'url';

import type {ChangeLocatorStrategy} from './strategies/interface';

export interface LocatorConfig {
	strategies: string[];
	resetStrategies: boolean;

	strategyConfigurations: JsonObject;
}

const locatorConfigKey = '@snuggery/affected';

type NullablePartial<T> = {
	[K in keyof T]?: T[K] | null | undefined;
};

const validateLocatorConfig: t.StrictValidator<
	JsonValue,
	NullablePartial<LocatorConfig>
> = t.isObject({
	strategies: t.isOptional(t.isNullable(t.isArray(t.isString()))),
	resetStrategies: t.isOptional(t.isNullable(t.isBoolean())),

	strategyConfigurations: t.isOptional(
		t.isNullable(t.isObject({}, {extra: t.isUnknown()})),
	),
});

function toLocatorConfig({
	resetStrategies,
	strategies,
	strategyConfigurations,
}: NullablePartial<LocatorConfig> = {}): LocatorConfig {
	return {
		resetStrategies: resetStrategies ?? false,
		strategies: strategies ?? [],
		strategyConfigurations: strategyConfigurations ?? {},
	};
}

function findLastIndex<T>(arr: T[], predicate: (value: T) => boolean): number {
	for (let i = arr.length - 1; i >= 0; i--) {
		if (predicate(arr[i]!)) {
			return i;
		}
	}

	return -1;
}

async function createCombinedStrategy(
	context: BuilderContext,
	{
		files,
		from,
		to,
		workspaceConfiguration: _workspaceConfiguration,
	}: FindChangeOptions,
) {
	const workspaceConfiguration =
		_workspaceConfiguration ?? (await findWorkspace(context));

	let locatorConfigurations = (
		await extractExtraConfiguration(
			{
				key: locatorConfigKey,
				test: validateLocatorConfig,
			},
			context,
			workspaceConfiguration,
		)
	).map(toLocatorConfig);

	{
		const lastReset = findLastIndex(
			locatorConfigurations,
			cfg => cfg.resetStrategies,
		);
		if (lastReset !== -1) {
			locatorConfigurations = locatorConfigurations.slice(lastReset);
		}
	}

	const strategies: Promise<[ChangeLocatorStrategy, JsonObject[]]>[] = [];
	const registeredStrategies = new Map<string, JsonObject[]>();

	function addStrategy(name: string) {
		let configs = registeredStrategies.get(name);

		if (configs != null) {
			return;
		}

		configs = [];
		registeredStrategies.set(name, configs);

		const require = createRequire(join(context.workspaceRoot, '<workspace>'));

		let path = name;
		let exportName: string | null = null;
		if (path.includes('#')) {
			[path, exportName] = path.split('#', 2) as [string, string];
		}

		strategies.push(
			import(pathToFileURL(require.resolve(path)).href).then(mod => {
				const strategy = exportName ? mod[exportName] : mod.default ?? mod;

				if (strategy == null) {
					throw new Error(`Failed to load strategy ${name}`);
				}

				return [strategy, configs!];
			}),
		);
	}

	addStrategy('@snuggery/affected/strategies#changedFiles');
	addStrategy('@snuggery/affected/strategies#projectsOfFiles');
	addStrategy('@snuggery/affected/strategies#packageDependencies');
	addStrategy('@snuggery/affected/strategies#extraProjectDependencies');

	for (const config of locatorConfigurations) {
		config?.strategies.forEach(addStrategy);
	}

	addStrategy('@snuggery/affected/strategies#removeOwnProject');

	for (const config of locatorConfigurations) {
		for (const [name, value] of Object.entries(
			config?.strategyConfigurations ?? {},
		)) {
			if (isJsonObject(value)) {
				const configs = registeredStrategies.get(name);

				configs?.push(value);
			}
		}
	}

	if (from != null || to != null) {
		registeredStrategies
			.get('@snuggery/affected/strategies#changedFiles')!
			.push({
				...(from != null ? {from} : null),
				...(to != null ? {to} : null),
			});
	}

	registeredStrategies.clear();

	async function findAffectedFiles() {
		if (files?.length) {
			return new Set(files);
		}

		const allFiles = new Set<string>();

		for (const [strategy, locatorConfigurations] of await Promise.all(
			strategies,
		)) {
			await strategy.findAffectedFiles?.(
				{
					context,
					workspaceConfiguration,
					locatorConfigurations,
				},
				allFiles,
			);
		}

		return allFiles;
	}

	return {
		findAffectedFiles,

		async findAffectedProjects() {
			const allFiles = await findAffectedFiles();

			const allProjects = new Set<string>();

			for (const [strategy, locatorConfigurations] of await Promise.all(
				strategies,
			)) {
				await strategy.findAffectedProjects?.(
					{
						context,
						workspaceConfiguration,
						locatorConfigurations,
					},
					allFiles,
					allProjects,
				);
			}

			return allProjects;
		},
	};
}

export interface FindChangeOptions {
	files?: string[];

	from?: string;
	to?: string;

	workspaceConfiguration?: WorkspaceDefinition;
}

export async function findAffectedProjects(
	context: BuilderContext,
	options: FindChangeOptions,
): Promise<Set<string>> {
	return (
		await createCombinedStrategy(context, options)
	).findAffectedProjects();
}

export async function findAffectedFiles(
	context: BuilderContext,
	options: FindChangeOptions,
): Promise<Set<string>> {
	return (await createCombinedStrategy(context, options)).findAffectedFiles();
}
