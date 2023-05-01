import type {Tree, SchematicContext} from '@angular-devkit/schematics';

import type {GeneralTransformFactory, Journey, TravelAgent} from '../types';

type GeneralJourney = Journey['general'];

export class GeneralTravelAgent implements TravelAgent, GeneralJourney {
	#configuring = true;
	#transforms = new Map<GeneralTransformFactory<unknown>, unknown[]>();
	#tree: Tree;
	#context: SchematicContext;

	constructor(tree: Tree, context: SchematicContext) {
		this.#tree = tree;
		this.#context = context;
	}

	#assertIsConfiguring(operation: string & keyof this) {
		if (!this.#configuring) {
			throw new Error(`${operation} must be called during Trip#configure`);
		}
	}

	addTransform(transform: (tree: Tree) => void | Promise<void>): void {
		this.#assertIsConfiguring('addTransform');
		this.#transforms.set(() => transform, []);
	}

	addDeduplicatedTransform<T>(
		transform: GeneralTransformFactory<T>,
		input: T,
	): void;
	addDeduplicatedTransform(
		transform: GeneralTransformFactory<unknown>,
		input: unknown,
	): void {
		this.#assertIsConfiguring('addDeduplicatedTransform');

		let inputs = this.#transforms.get(transform);
		if (inputs == null) {
			inputs = [];
			this.#transforms.set(transform, inputs);
		}

		inputs.push(input);
	}

	async bookTrips(): Promise<void> {
		this.#configuring = false;

		for (const [factory, input] of this.#transforms) {
			await factory({input, context: this.#context})(this.#tree);
		}
	}
}
