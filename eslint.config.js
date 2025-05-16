import js from "@eslint/js";
import {defineConfig, globalIgnores} from "eslint/config";
import * as importPlugin from "eslint-plugin-import";
import tseslint from "typescript-eslint";
import globals from "globals";

export default defineConfig(
	js.configs.recommended,
	tseslint.configs.recommended,
	importPlugin.flatConfigs.typescript,

	{
		languageOptions: {
			globals: {
				...globals.es2025,
				...globals.node,
			},
		},
	},

	{
		files: ["integration/__fixtures__/angular/**/*.ts"],
		rules: {
			"import/no-extraneous-dependencies": "off",
		},
	},

	globalIgnores([
		".yarn",
		".pnp.*",

		"dist",
		"packages/*/dist",
		"packages/*/out-tsc",
		"integration/__fixtures__/angular/dist",
		"integration/__fixtures__/angular/packages/*/dist",

		"packages/yarn-plugin-*/bin",
		"packages/yarn-plugin-*/bundles",
	]),
);
