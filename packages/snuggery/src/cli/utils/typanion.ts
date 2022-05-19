import type {JsonObject} from '@snuggery/core';
import {parse as parseJson} from 'json5';
import {SemVer, valid as isValidSemVer} from 'semver';
import {
	getPrintable,
	makeValidator,
	pushError,
	StrictValidator,
} from 'typanion';

export {isNumber, StrictValidator} from 'typanion';

export const isJSON5 = (): StrictValidator<unknown, JsonObject> =>
	makeValidator({
		test: (value, state): value is JsonObject => {
			let data;

			try {
				data = parseJson(value as string);

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

export const isSemVer = (): StrictValidator<unknown, SemVer> =>
	makeValidator({
		test(value, state): value is SemVer {
			if (typeof value === 'string' && isValidSemVer(value)) {
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
