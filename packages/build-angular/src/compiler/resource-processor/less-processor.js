import {BuildFailureError} from '../error.js';

/** @return {Promise<import('less')>} */
let getLess = () => {
	const less = import('less')
		.then((mod) => mod.default ?? mod)
		.catch((e) => {
			if (
				!e ||
				/** @type {NodeJS.ErrnoException} */ (e).code !== 'ERR_MODULE_NOT_FOUND'
			) {
				throw e;
			}

			throw new BuildFailureError(
				'Failed to load the less compiler, did you install less?',
			);
		});
	getLess = () => less;
	return less;
};

/** @type {import('../resource-processor.js').StyleProcessor} */
export const lessProcessor = {
	languageName: 'less',
	fileExtensions: ['.less'],
	async process({content, context}) {
		const {render} = await getLess();

		return await render(content, {
			filename: context.resourceFile ?? context.containingFile,
		});
	},
};
