import type {ErrorMeta, ErrorWithMeta} from 'clipanion';

export abstract class AbstractError extends Error implements ErrorWithMeta {
	readonly clipanion: ErrorMeta = {
		type: 'none',
	};

	constructor(message: string) {
		super(message);

		this.name = new.target.name;
	}
}
