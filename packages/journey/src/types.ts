import type {
	SchematicContext,
	Tree,
	UpdateRecorder,
} from '@angular-devkit/schematics';

export type {UpdateRecorder};

const kJourney = Symbol('journey');

/**
 * Opaque type for a journey
 */
export interface Journey {
	[kJourney]: object;
}

export interface Guide {
	(journey: Journey): void | Promise<void>;
}

const journeys = new WeakMap<
	Journey,
	{tree: Tree; context: SchematicContext; guides: Set<Guide>}
>();

export function createJourney(
	tree: Tree,
	context: SchematicContext,
): {journey: Journey; guides: Set<Guide>} {
	const journey = {[kJourney]: {}};
	Object.defineProperty(journey, kJourney, {enumerable: false});
	Object.freeze(journey);

	const guides = new Set<Guide>();

	journeys.set(journey, {tree, context, guides});
	return {journey, guides};
}

function getJourney(journey: Journey) {
	const val = journeys.get(journey);

	if (val == null) {
		throw new TypeError(`Expected a journey`);
	}

	return val;
}

/**
 * Access the `Tree` for the given journey
 */
export function getTree(journey: Journey): Tree {
	return getJourney(journey).tree;
}

/**
 * Access the context for the given journey
 */
export function getContext(journey: Journey): SchematicContext {
	return getJourney(journey).context;
}

/**
 * Registers the given guide for the given journey
 *
 * A guide can only be registered once per journey, registering a guide multiple
 * times in a journey will have no effect.
 *
 * Guides are executed after all trips in the journey have been registered. This
 * allows for guides to handle multiple trips at the same time. For example, if
 * there are three trips that loop through typescript files, it is better to
 * loop over all files once rather than three times.
 */
export function registerGuide(journey: Journey, guide: Guide): void {
	getJourney(journey).guides.add(guide);
}

/**
 * Object that can be passed into `journey` to be scheduled
 */
export interface Trip {
	/**
	 * Prepare this trip for the given journey
	 *
	 * All preparation should happen before the returned promise resolves (or
	 * before the function returns if the trip is synchronous).
	 * Modifying the `journey` afterwards is not supported.
	 */
	prepare(journey: Journey): void | Promise<void>;
}
