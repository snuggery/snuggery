import {type BuilderContext, BuildFailureError} from '@snuggery/architect';
import {isJsonObject, type JsonObject, type JsonValue} from '@snuggery/core';
import {parseSyml} from '@yarnpkg/parsers';
import {spawn} from 'node:child_process';
import fs from 'node:fs/promises';
import {dirname, join, parse as parsePath, resolve} from 'node:path';

export interface YarnPlugin {
	name: string;
	builtin: boolean;
}

function isYarnPlugin(value: JsonObject): value is JsonObject & YarnPlugin {
	return typeof value.name === 'string' && typeof value.builtin === 'boolean';
}

export const snuggeryPluginName = '@yarnpkg/plugin-snuggery';
const oldSnuggeryPluginName = '@yarnpkg/plugin-snuggery-workspace';

class OutdatedYarnPluginError extends BuildFailureError {
	constructor() {
		super(
			`Yarn plugin ${oldSnuggeryPluginName} is no longer supported, switch to an updated version of ${snuggeryPluginName} instead`,
		);
	}
}

export interface AppliedVersion {
	cwd: string;
	ident: string;
	oldVersion: string;
	newVersion: string;
}

function isAppliedVersion(
	value: JsonObject,
): value is JsonObject & AppliedVersion {
	return (
		typeof value.cwd === 'string' &&
		typeof value.ident === 'string' &&
		typeof value.oldVersion === 'string' &&
		typeof value.newVersion === 'string'
	);
}

export interface LogLine {
	type: 'info' | 'warning' | 'error';
	data: string;
}

function isLogLine(value: JsonObject): value is JsonObject & LogLine {
	return typeof value.type === 'string' && typeof value.data === 'string';
}

class Yarn {
	readonly #context: BuilderContext;
	readonly #yarnPath: string;

	constructor(yarnPath: string, context: BuilderContext) {
		this.#yarnPath = yarnPath;
		this.#context = context;
	}

	#exec(
		args: string[],
		opts: {
			captureNdjson: true;
			quiet?: boolean;
			cwd?: string;
			env?: NodeJS.ProcessEnv;
		},
	): Promise<JsonObject[]>;
	#exec(
		args: string[],
		opts: {
			captureNdjson?: false;
			quiet?: boolean;
			cwd?: string;
			env?: NodeJS.ProcessEnv;
		},
	): Promise<void>;
	#exec(
		args: string[],
		opts: {
			captureNdjson?: boolean;
			quiet?: boolean;
			cwd?: string;
			env?: NodeJS.ProcessEnv;
		},
	): Promise<JsonObject[] | void>;
	#exec(
		args: string[],
		{
			captureNdjson: capture,
			quiet,
			cwd = this.#context.workspaceRoot,
			env,
		}: {
			captureNdjson?: boolean;
			quiet?: boolean;
			cwd?: string;
			env?: NodeJS.ProcessEnv;
		},
	): Promise<JsonObject[] | void> {
		return new Promise((resolve, reject) => {
			const child = spawn(process.execPath, [this.#yarnPath, ...args], {
				cwd,
				env: {
					...process.env,
					...env,
					SNUGGERY_YARN: '1',
				},
				stdio: capture
					? ['ignore', 'pipe', 'ignore']
					: quiet
					? 'ignore'
					: 'inherit',
			});

			const {stdout} = child;
			const output =
				stdout &&
				new Promise<Buffer>((resolve, reject) => {
					const output: Buffer[] = [];

					stdout.on('data', (buffer) => output.push(buffer));
					stdout.on('close', () => resolve(Buffer.concat(output)));
					stdout.on('error', reject);
				});

			child.addListener('error', (err) =>
				reject(
					new BuildFailureError(
						`Failed to start yarn: ${
							err instanceof Error ? err.message : String(err)
						}`,
					),
				),
			);

			child.addListener('close', (code, signal) => {
				let rejectOrCall: (fn: () => void) => void;
				if (signal) {
					rejectOrCall = () =>
						reject(new BuildFailureError(`Yarn exited with signal ${signal}`));
				} else if (code) {
					rejectOrCall = () =>
						reject(new BuildFailureError(`Yarn exited with exit code ${code}`));
				} else {
					rejectOrCall = (fn) => fn();
				}

				if (!output) {
					rejectOrCall(resolve);
					return;
				}

				output.then(
					(buff) => {
						const lines = buff
							.toString('utf8')
							.split('\n')
							.filter((line) => line.trim())
							.map((line) => {
								try {
									return JSON.parse(line) as JsonValue;
								} catch {
									return null;
								}
							})
							.filter(isJsonObject);

						if (!quiet) {
							for (const {data, type} of lines.filter(isLogLine)) {
								this.#context.logger[type === 'warning' ? 'warn' : type]?.(
									data,
								);
							}
						}

						rejectOrCall(() => resolve(lines));
					},
					(err) => rejectOrCall(() => reject(err)),
				);
			});

			this.#context.addTeardown(() => {
				if (child.exitCode == null) {
					child.kill();
				}
			});
		});
	}

	async listPlugins(): Promise<YarnPlugin[]> {
		return (
			await this.#exec(['plugin', 'runtime', '--json'], {
				captureNdjson: true,
			})
		).filter(isYarnPlugin);
	}

	async hasPlugin(): Promise<boolean> {
		const plugins = await this.listPlugins();

		if (plugins.some((plugin) => plugin.name === oldSnuggeryPluginName)) {
			throw new OutdatedYarnPluginError();
		}

		return plugins.some((plugin) => plugin.name === snuggeryPluginName);
	}

	async applyVersion(): Promise<AppliedVersion[]> {
		const output = await this.#exec(['version', 'apply', '--all', '--json'], {
			captureNdjson: true,
		});

		const versions = output.filter(isAppliedVersion);
		if (versions.length === 0) {
			throw new Error(`No versions found to tag`);
		}

		return versions;
	}

	async snuggeryWorkspacePack({
		cwd,
		directoryToPack,
	}: {
		cwd: string;
		directoryToPack: string;
	}): Promise<void> {
		await this.#exec(
			['snuggery-workspace', 'pack', directoryToPack, '--json'],
			{
				cwd: resolve(this.#context.workspaceRoot, cwd),
				captureNdjson: true,
			},
		);
	}

	async npmPack({cwd}: {cwd: string}): Promise<void> {
		await this.#exec(['pack'], {
			cwd: resolve(this.#context.workspaceRoot, cwd),
		});
	}

	async snuggeryWorkspacePublish({
		tag,
		cwd,
	}: {
		tag?: string;
		cwd: string;
	}): Promise<void> {
		await this.#exec(
			[
				'snuggery-workspace',
				'publish',
				...(typeof tag === 'string' ? ['--tag', tag] : []),
				'--json',
			],
			{cwd: resolve(this.#context.workspaceRoot, cwd), captureNdjson: true},
		);
	}

	async npmPublish({tag, cwd}: {tag?: string; cwd: string}): Promise<void> {
		await this.#exec(
			['npm', 'publish', ...(typeof tag === 'string' ? ['--tag', tag] : [])],
			{cwd: resolve(this.#context.workspaceRoot, cwd)},
		);
	}

	async snuggeryWorkspaceUp(packages: string[]): Promise<void> {
		await this.#exec(['snuggery-workspace', 'up', ...packages], {
			cwd: this.#context.workspaceRoot,
		});
	}
}

export type {Yarn};

export async function loadYarn(context: BuilderContext): Promise<Yarn> {
	const yarnConfigurationPath = await findUp(
		'.yarnrc.yml',
		context.workspaceRoot,
	);

	if (!yarnConfigurationPath) {
		throw new BuildFailureError(
			`Couldn't find yarn configuration for ${context.workspaceRoot}`,
		);
	}

	const rawYarnConfiguration = await fs.readFile(yarnConfigurationPath, 'utf8');

	const yarnConfiguration = parseSyml(rawYarnConfiguration);

	if (typeof yarnConfiguration.yarnPath !== 'string') {
		throw new BuildFailureError(
			`Couldn't find path to yarn in ${context.workspaceRoot}`,
		);
	}

	return new Yarn(
		resolve(dirname(yarnConfigurationPath), yarnConfiguration.yarnPath),
		context,
	);
}

async function findUp(name: string, from: string): Promise<string | null> {
	const root = parsePath(from).root;

	let currentDir = from;
	while (currentDir && currentDir !== root) {
		const p = join(currentDir, name);
		try {
			if ((await fs.stat(p)).isFile()) {
				return p;
			}
		} catch {
			// ignore any error
			// continue to the next folder
		}

		currentDir = dirname(currentDir);
	}

	return null;
}
