import type {BuilderOutput, BuilderContext} from "@angular-devkit/architect";
import type {JsonObject} from "@snuggery/core";

const buildFailureError = Symbol.for("@snuggery/architect:BuildFailureError");

export class BuildFailureError extends Error {
	declare [buildFailureError]: true;

	constructor(message?: string) {
		super(message);

		this.name = "BuildFailureError";
		this[buildFailureError] = true;
	}
}

function isBuildFailureError(e: unknown): e is BuildFailureError {
	return typeof e === "object" && e != null && buildFailureError in e;
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
	| PromiseLike<BuilderOutput | void>
	| BuilderOutput
	| void;

export function createBuilder<OptT = JsonObject>(
	fn: (input: OptT, context: BuilderContext) => BuilderOutputLike,
) {
	const {isBuilderOutput, createBuilder} =
		require("@angular-devkit/architect") as typeof import("@angular-devkit/architect");

	return createBuilder<OptT>((input, context) => {
		try {
			const output = fn(input, context);

			if (output == null || isBuilderOutput(output)) {
				return {success: true, ...output} as BuilderOutput;
			} else if (isPromiseLike(output)) {
				return Promise.resolve(output).then(
					(result) => ({success: true, ...result}) as BuilderOutput,
					(e) => handleError(e),
				);
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

function isPromiseLike(value: object): value is PromiseLike<unknown> {
	return (
		"then" in value &&
		typeof (value as PromiseLike<unknown>).then === "function"
	);
}

async function* wrapOutputIterable(
	output: AsyncIterable<BuilderOutput>,
): AsyncIterable<BuilderOutput> {
	try {
		for await (const o of output) {
			yield {
				// @ts-expect-error typescript knows success is already in `o`
				success: true,
				...o,
			} as BuilderOutput;
		}
	} catch (e) {
		yield handleError(e);
	}
}
