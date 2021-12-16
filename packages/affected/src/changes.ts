import type {BuilderContext} from '@angular-devkit/architect';
import {findWorkspace} from '@snuggery/architect';
import {
	JsonObject,
	isJsonObject,
	isJsonArray,
	getPrintableType,
	WorkspaceDefinition,
} from '@snuggery/core';
import {createRequire} from 'module';
import {join} from 'path';

import type {ChangeLocatorStrategy} from './strategies/interface';

export interface LocatorConfig {
	strategies: string[];
	resetStrategies: boolean;

	strategyConfigurations: JsonObject;
}

function _getLocatorConfig(
	context: BuilderContext,
	value?: JsonObject,
): LocatorConfig {
	const config = value?.['@snuggery/affected'];

	if (!isJsonObject(config)) {
		if (config != null) {
			context.logger.error(
				`Expected @snuggery/affected value to be an object, but got ${getPrintableType(
					config,
				)}`,
			);
		}

		return {
			strategies: [],
			resetStrategies: false,
			strategyConfigurations: {},
		};
	}

	let resetStrategies = false;
	if (config.resetStrategies != null) {
		if (typeof config.resetStrategies !== 'boolean') {
			context.logger.error(
				`Expected @snuggery/affected option resetStrategies to be a boolean but got ${getPrintableType(
					config.resetStrategies,
				)}`,
			);
		}

		resetStrategies = config.resetStrategies === true;
	}

	const strategies: string[] = [];
	if (config.strategies != null) {
		if (!isJsonArray(config.strategies)) {
			context.logger.error(
				`Expected @snuggery/affected option strategies to be a boolean but got ${getPrintableType(
					config.strategies,
				)}`,
			);
		} else {
			for (const strategy of config.strategies) {
				if (typeof strategy !== 'string') {
					context.logger.error(
						`Expected @snuggery/affected option strategies to contain strings only but got ${getPrintableType(
							strategy,
						)}`,
					);
				} else {
					strategies.push(strategy);
				}
			}
		}
	}

	let strategyConfigurations: JsonObject = {};
	if (config.strategyConfigurations != null) {
		if (!isJsonObject(config.strategyConfigurations)) {
			context.logger.error(
				`Expected @snuggery/affected option strategyConfigurations to be an object but got ${getPrintableType(
					config.strategyConfigurations,
				)}`,
			);
		} else {
			strategyConfigurations = config.strategyConfigurations;
		}
	}

	const allKeys = new Set(Object.keys(config));

	allKeys.delete('strategies');
	allKeys.delete('resetStrategies');
	allKeys.delete('strategyConfigurations');

	if (allKeys.size) {
		context.logger.error(
			`Unexpected @snuggery/affected options ${Array.from(allKeys).join(', ')}`,
		);
	}

	return {
		strategies,
		resetStrategies,
		strategyConfigurations,
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

	let locatorConfigurations: LocatorConfig[] = [
		_getLocatorConfig(context, workspaceConfiguration.extensions),
	];

	if (context.target?.target) {
		const project = workspaceConfiguration.projects.get(
			context.target.project,
		)!;
		const target = project.targets.get(context.target.target)!;

		locatorConfigurations.push(_getLocatorConfig(context, project.extensions));
		locatorConfigurations.push(_getLocatorConfig(context, target.extensions));
	}

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
			(
				Function(
					'path',
					'return import(path)',
					// eslint-disable-next-line @typescript-eslint/no-explicit-any
				)(require.resolve(path)) as Promise<any>
			).then(mod => {
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
