import type {ErrorMeta, ErrorWithMeta} from "clipanion";

export abstract class AbstractError extends Error implements ErrorWithMeta {
	readonly clipanion: ErrorMeta = {
		type: "none",
	};

	constructor(message: string, options?: ErrorOptions) {
		super(message, options);

		this.name = new.target.name;
	}
}
