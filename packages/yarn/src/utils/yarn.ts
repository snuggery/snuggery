import type {BuilderContext} from '@angular-devkit/architect';
import {isJsonObject, JsonObject, JsonValue} from '@angular-devkit/core';
import {parseSyml} from '@yarnpkg/parsers';
import {spawn} from 'child_process';
import {promises as fs} from 'fs';
import {dirname, join, parse as parsePath, resolve} from 'path';
import {Observable} from 'rxjs';
import {map, mapTo} from 'rxjs/operators';

export interface YarnPlugin {
	name: string;
	builtin: boolean;
}

function isYarnPlugin(value: JsonObject): value is JsonObject & YarnPlugin {
	return typeof value.name === 'string' && typeof value.builtin === 'boolean';
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
	): Observable<JsonObject[]>;
	#exec(
		args: string[],
		opts: {
			captureNdjson?: false;
			quiet?: boolean;
			cwd?: string;
			env?: NodeJS.ProcessEnv;
		},
	): Observable<void>;
	#exec(
		args: string[],
		opts: {
			captureNdjson?: boolean;
			quiet?: boolean;
			cwd?: string;
			env?: NodeJS.ProcessEnv;
		},
	): Observable<JsonObject[] | void>;
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
	): Observable<JsonObject[] | void> {
		return new Observable(observer => {
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

					stdout.on('data', buffer => output.push(buffer));
					stdout.on('close', () => resolve(Buffer.concat(output)));
					stdout.on('error', reject);
				});

			child.addListener('error', err => observer.error(err));

			child.addListener('close', (code, signal) => {
				if (signal) {
					observer.error(new Error(`Yarn exited with signal ${signal}`));
				} else if (code) {
					observer.error(new Error(`Yarn exited with exit code ${code}`));
				} else {
					if (output) {
						output.then(
							buff => {
								const lines = buff
									.toString('utf8')
									.split('\n')
									.filter(line => line.trim())
									.map(line => {
										try {
											return JSON.parse(line) as JsonValue;
										} catch {
											return null;
										}
									})
									.filter((value): value is JsonObject => isJsonObject(value));

								if (!quiet) {
									for (const {data, type} of lines.filter(isLogLine)) {
										this.#context.logger[type === 'warning' ? 'warn' : type]?.(
											data,
										);
									}
								}

								observer.next(lines);
								observer.complete();
							},
							err => observer.error(err),
						);
					} else {
						observer.next();
						observer.complete();
					}
				}
			});

			return () => {
				if (child.exitCode == null) {
					child.kill();
				}
			};
		});
	}

	listPlugins(): Observable<YarnPlugin[]> {
		return this.#exec(['plugin', 'runtime', '--json'], {
			captureNdjson: true,
		}).pipe(map(output => output.filter(isYarnPlugin)));
	}

	applyVersion(): Observable<AppliedVersion[]> {
		return this.#exec(['version', 'apply', '--all', '--json'], {
			captureNdjson: true,
		}).pipe(
			map(output => {
				const versions = output.filter(isAppliedVersion);

				if (versions.length === 0) {
					throw new Error(`No versions found to tag`);
				}

				return versions;
			}),
		);
	}

	snuggeryWorkspacePack({
		cwd,
		directoryToPack,
	}: {
		cwd: string;
		directoryToPack: string;
	}): Observable<void> {
		return this.#exec(
			['snuggery-workspace', 'pack', directoryToPack, '--json'],
			{
				cwd: resolve(this.#context.workspaceRoot, cwd),
				captureNdjson: true,
			},
		).pipe(mapTo(undefined));
	}

	npmPack({cwd}: {cwd: string}): Observable<void> {
		return this.#exec(['pack'], {
			cwd: resolve(this.#context.workspaceRoot, cwd),
		});
	}

	snuggeryWorkspacePublish({
		tag,
		cwd,
	}: {
		tag?: string;
		cwd: string;
	}): Observable<void> {
		return this.#exec(
			[
				'snuggery-workspace',
				'publish',
				...(typeof tag === 'string' ? ['--tag', tag] : []),
				'--json',
			],
			{cwd: resolve(this.#context.workspaceRoot, cwd), captureNdjson: true},
		).pipe(mapTo(undefined));
	}

	npmPublish({tag, cwd}: {tag?: string; cwd: string}): Observable<void> {
		return this.#exec(
			['npm', 'publish', ...(typeof tag === 'string' ? ['--tag', tag] : [])],
			{cwd: resolve(this.#context.workspaceRoot, cwd)},
		);
	}

	snuggeryWorkspaceUp(packages: string[]): Observable<void> {
		return this.#exec(['snuggery-workspace', 'up', ...packages], {
			cwd: this.#context.workspaceRoot,
		}).pipe(mapTo(undefined));
	}
}

export type {Yarn};

export async function loadYarn(context: BuilderContext): Promise<Yarn> {
	const yarnConfigurationPath = await findUp(
		'.yarnrc.yml',
		context.workspaceRoot,
	);

	if (!yarnConfigurationPath) {
		throw new Error(
			`Couldn't find yarn configuration for ${context.workspaceRoot}`,
		);
	}

	const rawYarnConfiguration = await fs.readFile(yarnConfigurationPath, 'utf8');

	const yarnConfiguration = parseSyml(rawYarnConfiguration);

	if (typeof yarnConfiguration.yarnPath !== 'string') {
		throw new Error(`Couldn't find path to yarn in ${context.workspaceRoot}`);
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
