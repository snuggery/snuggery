import {spawn} from 'child_process';
import {normalize} from 'path';
import type {Readable} from 'stream';

import type {VersionControlSystem} from './abstract';

function collectStream(stream: Readable): Promise<Buffer> {
	return new Promise((resolve, reject) => {
		const buffers: Buffer[] = [];

		stream.on('data', b => buffers.push(b));

		stream.on('close', () => resolve(Buffer.concat(buffers)));
		stream.on('error', e => reject(e));
	});
}

async function git(cwd: string, ...args: string[]) {
	const child = spawn('git', args, {
		cwd,
		stdio: ['ignore', 'pipe', 'pipe'],
	});

	const stdout = collectStream(child.stdout);
	const stderr = collectStream(child.stderr);

	try {
		await new Promise<void>((resolve, reject) => {
			child.on('exit', (code, signal) => {
				if (signal != null) {
					reject(new Error(`Git exited with signal ${signal}`));
				} else if (code) {
					reject(new Error(`Git exited with code ${code}`));
				} else {
					resolve();
				}
			});

			child.on('error', e => reject(e));
		});
	} catch (e) {
		if (!(e instanceof Error)) {
			throw e;
		}

		try {
			const stderr_str = (await stderr).toString('utf8');

			e.message += `\n\nSTDERR: ${stderr_str}`;
		} catch {
			// ignore
		}

		throw e;
	}

	return (await stdout).toString('utf8').trim();
}

export class GitRepository implements VersionControlSystem {
	static async create({
		location,
	}: {
		location: string;
	}): Promise<GitRepository | null> {
		let repositoryFolder;
		try {
			repositoryFolder = await git(location, 'rev-parse', '--show-toplevel');
		} catch {
			return null;
		}

		if (normalize(repositoryFolder) !== normalize(location)) {
			return null;
		}

		return new GitRepository(repositoryFolder);
	}

	private constructor(private readonly repositoryFolder: string) {}

	async getChangedFiles({
		from,
		to,
		exclude = [],
	}: {
		from?: string;
		to?: string;
		exclude?: string[];
	}): Promise<Set<string>> {
		const files = new Set<string>();

		const addFilesFrom = async (...args: string[]) => {
			for (const file of (await git(this.repositoryFolder, ...args)).split(
				/(?:\r?\n)+/,
			)) {
				files.add(file);
			}
		};

		if (to != null) {
			from ??= `${to}^`;
		} else {
			from ??= 'HEAD';

			await Promise.all([
				addFilesFrom(
					'ls-files',
					'--others',
					'--exclude-standard',
					...exclude.map(f => `--exclude=/${f}`),
				),
				addFilesFrom(
					'diff',
					'--name-only',
					'--relative',
					'HEAD',
					'--',
					':/',
					...exclude.map(f => `:^${f}`),
				),
			]);
		}

		await addFilesFrom(
			'diff',
			'--name-only',
			'--relative',
			`${from}...${to ?? ''}`,
			'--',
			':/',
			...exclude.map(f => `:^${f}`),
		);

		return files;
	}
}
