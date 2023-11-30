/** @type {import('prettier').Config} */
module.exports = {
	singleQuote: true,
	trailingComma: 'all',
	bracketSpacing: false,
	useTabs: true,

	plugins: [require.resolve('@bgotink/prettier-plugin-kdl')],
};
