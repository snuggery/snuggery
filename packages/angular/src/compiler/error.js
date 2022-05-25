/**
 * Error thrown by the compiler when the compilation failed due to user error, e.g. invalid code.
 */
export class BuildFailureError extends Error {
	/**
	 * @param {string} message
	 */
	constructor(message) {
		super(message);

		this.name = new.target.name;
	}
}
