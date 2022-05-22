#!/usr/bin/env node
// @ts-check
/// <reference lib="es2020" />
/// <reference types="node" />

import childProcess from 'node:child_process';
import {readFile, writeFile, readdir} from 'node:fs/promises';
import {dirname, resolve} from 'node:path';
import {env, argv, exit} from 'node:process';
import {fileURLToPath} from 'node:url';

process.chdir(dirname(dirname(fileURLToPath(import.meta.url))));

const validate = argv[2] === 'validate';

/**
 * @param {string} command
 * @returns {Promise<string>}
 */
function exec(command) {
	return new Promise((resolve, reject) => {
		childProcess.exec(
			command,
			{
				env: {
					...env,
					FORCE_COLOR: '0',
				},
			},
			(error, stdout) => {
				if (error) {
					reject(error);
				} else {
					resolve(stdout);
				}
			},
		);
	});
}

for (const dir of await readdir('packages')) {
	const readmeFile = resolve('packages', dir, 'README.md');
	let readme;
	try {
		readme = await readFile(readmeFile, 'utf-8');
	} catch (e) {
		if (e && /** @type {NodeJS.ErrnoException} */ (e).code === 'ENOENT') {
			continue;
		}

		throw e;
	}

	const lines = readme.split(/\r?\n/);
	let commandIndex = -1;
	const modifiedIndices = new Set();
	while (
		(commandIndex = lines.findIndex(
			(line, index) =>
				!modifiedIndices.has(index) &&
				line.startsWith('<!-- auto generate:') &&
				line.endsWith('-->'),
		)) !== -1
	) {
		modifiedIndices.add(commandIndex);

		const command = lines[commandIndex].slice(19, -3).trim();
		const output = await exec(command);

		const startOfCodeBlock = lines.indexOf('```', commandIndex + 1);
		const endOfCodeBlock = lines.indexOf('```', startOfCodeBlock + 1);
		if (startOfCodeBlock === -1 || endOfCodeBlock === -1) {
			throw new Error(`Expected to find code block after command "${command}"`);
		}

		lines.splice(
			startOfCodeBlock + 1,
			endOfCodeBlock - startOfCodeBlock - 1,
			output
				.trim() // remove trailing empty lines
				.replace(/ +$/gm, '') // remove trailing whitespace
				.replace(/^Snuggery - [^\n]+/, 'Snuggery'), // remove any version header
		);
	}

	if (!modifiedIndices.size) {
		continue;
	}

	const updatedReadme = lines.join('\n');
	if (updatedReadme === readme) {
		continue;
	}

	if (validate) {
		console.error(`README file ${readmeFile} needs to be updated, run`);
		console.error('  yarn update-help');
		console.error('to update the file');

		exit(1);
	}

	await writeFile(readmeFile, updatedReadme);
}
