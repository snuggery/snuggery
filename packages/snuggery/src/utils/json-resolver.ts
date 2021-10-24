/* eslint-disable @typescript-eslint/no-var-requires */

import {isJsonObject, JsonObject} from '@angular-devkit/core';
import {capitalize} from '@angular-devkit/core/src/utils/strings';
import type {ErrorWithMeta} from 'clipanion';
import {createRequire} from 'module';
import {join} from 'path';

import {AbstractError} from './error';

export class CyclicDependencyError
	extends AbstractError
	implements ErrorWithMeta
{
	readonly clipanion = {
		type: 'none',
	} as const;

	constructor(
		angularKey: string,
		originalRequest: string,
		seenPaths: Iterable<string>,
	) {
		super(
			`Cycle while loading ${angularKey} for ${originalRequest}: ${Array.from(
				seenPaths,
			).join(', ')}`,
		);
	}
}

export class UnableToResolveError
	extends AbstractError
	implements ErrorWithMeta
{
	readonly clipanion = {
		type: 'none',
	} as const;

	constructor(angularKey: string, request: string, from: string) {
		super(`Unable to resolve ${angularKey} ${request} from ${from}`);
	}
}

export class InvalidDefinitionError
	extends AbstractError
	implements ErrorWithMeta
{
	readonly clipanion = {
		type: 'none',
	} as const;

	constructor(angularKey: string, originalRequest: string) {
		super(`Invalid definition found for ${angularKey} in ${originalRequest}`);

		this.name = `Invalid${capitalize(angularKey)}Error`;
	}
}

function loadJsonStep(
	from: string,
	request: string,
	angularKey: string,
	nxKey: string,
	seenPaths: Set<string>,
	originalRequest: string,
): [JsonObject, string] {
	const require = createRequire(from);

	let jsonPath;
	try {
		jsonPath = require.resolve(`./${request}`);
	} catch {
		try {
			jsonPath = require.resolve(join(request, 'package.json'));
		} catch {
			try {
				jsonPath = require.resolve(request);
			} catch {
				throw new UnableToResolveError(angularKey, request, from);
			}
		}
	}

	if (seenPaths.has(jsonPath)) {
		throw new CyclicDependencyError(angularKey, originalRequest, seenPaths);
	}
	seenPaths.add(jsonPath);

	const json = require(jsonPath) as JsonObject;

	const {[angularKey]: angularProperty, [nxKey]: nxProperty} = json;

	if (typeof angularProperty === 'string') {
		return loadJsonStep(
			jsonPath,
			angularProperty,
			angularKey,
			nxKey,
			seenPaths,
			originalRequest,
		);
	}

	if (
		(angularProperty == null && nxProperty == null) ||
		(angularProperty != null && !isJsonObject(angularProperty)) ||
		(nxProperty != null && !isJsonObject(nxProperty))
	) {
		throw new InvalidDefinitionError(angularKey, originalRequest);
	}

	return [json, jsonPath];
}

export function loadJson(
	from: string | readonly [string, ...string[]],
	request: string,
	angularKey: string,
	nxKey: string,
): [content: JsonObject, path: string] {
	if (typeof from === 'string') {
		return loadJsonStep(
			join(from, '<workspace>'),
			request,
			angularKey,
			nxKey,
			new Set(),
			request,
		);
	}

	for (const f of from) {
		try {
			return loadJsonStep(
				join(f, '<workspace>'),
				request,
				angularKey,
				nxKey,
				new Set(),
				request,
			);
		} catch (e) {
			if (!(e instanceof UnableToResolveError)) {
				throw e;
			}
		}
	}

	throw new UnableToResolveError(angularKey, request, from[0]!);
}
