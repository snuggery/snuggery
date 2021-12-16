import {TransientTarget} from '@snuggery/architect';

export interface BaseSchema {
	include?: string | string[];

	exclude?: string | string[];

	printOnly?: boolean;

	fromRevision?: string;

	toRevision?: string;

	affectedFiles?: string[];

	files?: string | string[];

	optionName: string;
}

export interface TargetSchema extends BaseSchema {
	target: string;
}

export interface BuilderSchema extends BaseSchema, TransientTarget {}

export type Schema = TargetSchema | BuilderSchema;
