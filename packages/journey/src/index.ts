import type {Rule, RuleFactory} from '@angular-devkit/schematics';

import {type Trip, createJourney} from './types';

export {
	type Journey,
	type Trip,
	type Guide,
	type UpdateRecorder,
	registerGuide,
	getContext,
	getTree,
} from './types';

/**
 * Create a journey from the given trips
 *
 * The return value is a `Rule` that can be used in a schematic. It is also a
 * valid `RuleFactory` meaning you can use the returned value directly as
 * factory for your schematic or migration.
 */
export function journey(
	...trips: readonly Trip[]
): Rule & RuleFactory<Record<string, unknown>> {
	return () => async (tree, context) => {
		const {journey, guides} = createJourney(tree, context);

		// Explicitly run through `Trip#prepare` and registered `guide`s one
		// by one instead of using `Promise.all` because determinism is important.
		// If in `Promise.all` the order of operations becomes non-deterministic,
		// who's to say what the impact might be on the actual journeys?

		for (const trip of trips) {
			await trip.prepare(journey);
		}

		for (const guide of guides) {
			await guide(journey);
		}
	};
}
