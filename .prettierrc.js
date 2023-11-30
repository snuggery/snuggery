/** @type {import('prettier').Config} */
module.exports = {
	bracketSpacing: false,
	useTabs: true,

	plugins: [require.resolve("@bgotink/prettier-plugin-kdl")],
};
