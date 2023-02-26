import {
	createBuilder as _createBuilder,
	isBuilderOutput,
	type BuilderOutput,
	type BuilderContext,
} from '@angular-devkit/architect';
import type {JsonObject} from '@angular-devkit/core';

const buildFailureError = Symbol.for('@snuggery/architect:BuildFailureError');

export class BuildFailureError extends Error {
	declare [buildFailureError]: true;

	constructor(message?: string) {
		super(message);

		this.name = 'BuildFailureError';
		this[buildFailureError] = true;
	}
}

function isBuildFailureError(e: unknown): e is BuildFailureError {
	return e != null && buildFailureError in e;
}

function handleError(e: unknown): BuilderOutput {
	if (isBuildFailureError(e)) {
		return {success: false, error: (e as BuildFailureError).message};
	} else {
		throw e;
	}
}

export type {BuilderContext, BuilderOutput};

export type BuilderOutputLike =
	| AsyncIterable<BuilderOutput>
	| PromiseLike<BuilderOutput>
	| BuilderOutput;

export function createBuilder<OptT = JsonObject>(
	fn: (input: OptT, context: BuilderContext) => BuilderOutputLike,
) {
	return _createBuilder<OptT>((input, context) => {
		try {
			const output = fn(input, context);

			if (isBuilderOutput(output)) {
				return output;
			} else if (isPromiseLike(output)) {
				return Promise.resolve(output).catch(e => handleError(e));
			} else if (Symbol.asyncIterator in output) {
				return wrapOutputIterable(output);
			} else {
				throw new Error(`Unexpected output ${output}`);
			}
		} catch (e) {
			return handleError(e);
		}
	});
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
	return (
		!!value &&
		'then' in value &&
		typeof (value as PromiseLike<unknown>).then === 'function'
	);
}

async function* wrapOutputIterable(
	output: AsyncIterable<BuilderOutput>,
): AsyncIterable<BuilderOutput> {
	try {
		for await (const o of output) {
			yield o;
		}
	} catch (e) {
		yield handleError(e);
	}
}
