import {GlobSchema} from "@snuggery/snuggery/builders";

export type Schema = GlobSchema & {
	printOnly?: boolean;

	fromRevision?: string;

	toRevision?: string;

	affectedFiles?: string[];
};
