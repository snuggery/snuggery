import {
	type BuilderContext,
	extractExtraConfiguration,
} from "@snuggery/architect";
import * as t from "typanion";

const testConfiguration = t.isObject({
	tsconfig: t.isOptional(t.isString()),
	plugins: t.isOptional(t.isArray(t.isString())),

	keepScripts: t.isOptional(t.isBoolean()),
	keepDevDependencies: t.isOptional(t.isBoolean()),

	packager: t.isOptional(t.isString()),
});

export async function loadConfiguration(
	context: BuilderContext,
): Promise<t.InferType<typeof testConfiguration>> {
	const configs = await extractExtraConfiguration(
		{
			key: "@snuggery/build-node",
			test: testConfiguration,
		},
		context,
	);

	if (!configs.length) {
		return {};
	}

	return configs.reduce((a, b) => ({
		...a,
		...b,
	}));
}
