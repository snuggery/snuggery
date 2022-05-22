export class BuildFailureError extends Error {
	/**
	 * @param {string} message
	 */
	constructor(message) {
		super(message);

		this.name = new.target.name;
	}
}
