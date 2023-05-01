import type {SchematicContext, Tree} from '@angular-devkit/schematics';
import type {ts} from '@snuggery/schematics/typescript';

export interface Journey {
	tree: Tree;

	context: SchematicContext;

	typescript: {
		addTransform(transform: ts.TransformerFactory<ts.SourceFile>): void;

		addDeduplicatedTransform<T>(
			transform: TypescriptTransformFactory<T>,
			input: T,
		): void;

		typeCheck(): {
			program: ts.Program;
			typeChecker: ts.TypeChecker;
		};
	};
}

export type TypescriptTransformFactory<T> = (journey: {
	input: T[];
	tree: Tree;
	context: SchematicContext;
}) => ts.TransformerFactory<ts.SourceFile>;

export interface TravelAgent {
	bookTrips(): void | Promise<void>;
}

export interface Trip {
	name: string;

	configure(journey: Journey): void | Promise<void>;
}
