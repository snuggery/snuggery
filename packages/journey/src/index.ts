import type {Rule} from '@angular-devkit/schematics';

import {TypescriptTravelAgent} from './agents/typescript';
import type {TravelAgent, Trip} from './types';

export type {Journey, Trip, TypescriptTransformFactory} from './types';

export function journey(...trips: readonly Trip[]): Rule {
	return async (tree, context) => {
		const agents: TravelAgent[] = [];

		const typescript = new TypescriptTravelAgent(tree, context);
		agents.push(typescript);

		for (const trip of trips) {
			await trip.configure({
				context,
				tree,
				typescript,
			});
		}

		for (const agent of agents) {
			await agent.bookTrips();
		}
	};
}
