import type {Rule, RuleFactory} from '@angular-devkit/schematics';

import {GeneralTravelAgent} from './agents/general';
import {TypescriptTravelAgent} from './agents/typescript';
import type {TravelAgent, Trip} from './types';

export type {Journey, Trip, TypescriptTransformFactory} from './types';

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
		const general = new GeneralTravelAgent(tree, context);
		const typescript = new TypescriptTravelAgent(tree, context);

		const agents: TravelAgent[] = [general, typescript];

		// Explicitly run through `Trip#configure` and `TravelAgent#bookTrips` one
		// by one instead of using `Promise.all` because determinism is important.
		// If in `Promise.all` the order of operations becomes non-deterministic,
		// who's to say what the impact might be on the actual journeys?

		for (const trip of trips) {
			await trip.configure({
				context,
				general,
				typescript,
			});
		}

		for (const agent of agents) {
			await agent.bookTrips();
		}
	};
}
