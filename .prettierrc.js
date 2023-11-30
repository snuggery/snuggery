/** @type {import('prettier').Config} */
module.exports = {
	bracketSpacing: false,

	plugins: [require.resolve("@bgotink/prettier-plugin-kdl")],
};
