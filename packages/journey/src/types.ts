import type {SchematicContext, Tree} from '@angular-devkit/schematics';
import type {ts} from '@snuggery/schematics/typescript';

export interface Journey {
	context: SchematicContext;

	/**
	 * Functions to register transformations
	 *
	 * These functions are low-level, they function on file content as text,
	 * without any processing tied to the file type.
	 */
	general: {
		/**
		 * Register the given transform
		 */
		addTransform(transform: (tree: Tree) => void | Promise<void>): void;

		/**
		 * Register the given transform
		 *
		 * Contrary to `addTransform` this function will only run the given transform
		 * once even if it has been registered multiple times. All passed inputs are
		 * combined and given to the transform as an array.
		 */
		addDeduplicatedTransform<T>(
			transform: GeneralTransformFactory<T>,
			input: T,
		): void;
	};

	/**
	 * Utilities to register transformations via the typescript API
	 *
	 * These utilities loop over all javascript and typescript files throughout
	 * the project, using one of two mechanisms:
	 * - If no trip has requested the type checker, then simply loop over all
	 *   files with the correct file extensions. The given AST objects will not
	 *   have any type information available, and `Node#parent` will not be filled
	 *   in.
	 * - If any trip requested the type checker, then try to discover all
	 *   `tsconfig` and `jsconfig` files and loop through all files in all of
	 *   these `Program`s. Files are only processed once, even if they're present
	 *   in multiple files.
	 *
	 * All registered typescript transforms are executed in a single pass, i.e.
	 * the journey only loops over the typescript files once.
	 */
	typescript: {
		/**
		 * Register the given transform for all source files
		 */
		addTransform(transform: ts.TransformerFactory<ts.SourceFile>): void;

		/**
		 * Register the given transform for all source files
		 *
		 * Contrary to `addTransform` this function will only run the given transform
		 * once even if it has been registered multiple times. All passed inputs are
		 * combined and given to the transform as an array.
		 */
		addDeduplicatedTransform<T>(
			transform: TypescriptTransformFactory<T>,
			input: T,
		): void;

		/**
		 * Get access to the `Program` and `TypeChecker`
		 *
		 * This method has to be called during `Trip#configure`, but the returned
		 * program and type checker can only be used as part of a registered
		 * transform.
		 */
		typeCheck(): {
			program: ts.Program;
			typeChecker: ts.TypeChecker;
		};
	};
}

export type GeneralTransformFactory<T> = (journey: {
	input: T[];
	context: SchematicContext;
}) => (tree: Tree) => void | Promise<void>;

export type TypescriptTransformFactory<T> = (journey: {
	input: T[];
	context: SchematicContext;
}) => ts.TransformerFactory<ts.SourceFile>;

export interface TravelAgent {
	bookTrips(): void | Promise<void>;
}

/**
 * Object that can be passed into `journey` to be scheduled
 */
export interface Trip {
	/**
	 * Configure the given journey
	 *
	 * All configuration should happen before the returned promise resolves (or
	 * before the function returns if the trip is synchronous).
	 * Modifying the `journey` configuration afterwards is not supported.
	 */
	configure(journey: Journey): void | Promise<void>;
}
