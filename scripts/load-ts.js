const {register} = require("node:module");
const {pathToFileURL} = require("node:url");

const jsLoader = require.extensions[".js"];

require("esbuild-register/dist/node").register({
	extensions: [".cts", ".ts"],
	format: "cjs",
	target: ["node18"],
	tsconfigRaw: {
		compilerOptions: {
			experimentalDecorators: true,
		},
	},
});

const traceCli =
	process.argv.length === 3 &&
	process.argv[2] === "--validate-cli-dependencies";

register("./loader.mjs", {
	parentURL: pathToFileURL(__filename),
	data: {traceCli},
});
