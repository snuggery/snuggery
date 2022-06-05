import type {JsonObject} from '@snuggery/core';
import type SemVer from 'semver/classes/semver.js';
import {
	getPrintable,
	makeValidator,
	pushError,
	type StrictValidator,
} from 'typanion';

export {isNumber, StrictValidator} from 'typanion';

export const isJSON5 = (): StrictValidator<unknown, JsonObject> => {
	const JSON5: typeof import('json5') = require('json5');
	return makeValidator({
		test: (value, state): value is JsonObject => {
			let data;

			try {
				data = JSON5.parse(value as string);

				if (state?.coercions != null && state.coercion != null) {
					state.coercions.push([
						state.p ?? '.',
						state.coercion.bind(null, data),
					]);
				}

				return true;
			} catch {
				return pushError(
					state,
					`Expected to be a valid JSON5 string (got ${getPrintable(value)})`,
				);
			}
		},
	});
};

export const isEnum = <T extends (number | string | boolean | null)[]>(
	allowedValuesArr: T,
): StrictValidator<unknown, T[number]> => {
	const allowedValues = new Set(allowedValuesArr);

	return makeValidator({
		test: (value, state): value is T[number] => {
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			if (!allowedValues.has(value as any)) {
				return pushError(
					state,
					`Expected one of ${allowedValuesArr
						.map(value => JSON.stringify(value))
						.join(', ')}; but got ${JSON.stringify(value)}`,
				);
			}

			return true;
		},
	});
};

export const isSemVer = (): StrictValidator<unknown, SemVer> => {
	const valid =
		require('semver/functions/valid.js') as typeof import('semver/functions/valid.js');
	const SemVer =
		require('semver/classes/semver.js') as typeof import('semver/classes/semver.js');
	return makeValidator({
		test(value, state): value is SemVer {
			if (typeof value === 'string' && valid(value)) {
				if (state?.coercions != null && state.coercion != null) {
					state.coercions.push([
						state.p ?? '.',
						state.coercion.bind(null, new SemVer(value)),
					]);
				}

				return true;
			}

			return pushError(
				state,
				`Expected a valid SemVer version number but got ${JSON.stringify(
					value,
				)}`,
			);
		},
	});
};
