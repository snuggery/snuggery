/** @type {import('prettier').Config} */
module.exports = {
	bracketSpacing: false,
	experimentalTernaries: true,

	// Re-enable once the plugin supports KDL 2
	plugins: [require.resolve("@bgotink/prettier-plugin-kdl")],
};
