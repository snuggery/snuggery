import {extractExtraConfiguration} from '@snuggery/architect';
import * as t from 'typanion';

const testConfiguration = t.isObject({
	tsconfig: t.isOptional(t.isString()),
	plugins: t.isOptional(t.isArray(t.isString())),

	keepScripts: t.isOptional(t.isBoolean()),
	keepDevDependencies: t.isOptional(t.isBoolean()),

	packager: t.isOptional(t.isString()),

	inlineStyleLanguage: t.isOptional(t.isString()),

	flags: t.isOptional(
		t.isObject({
			usePrivateApiAsImportIssueWorkaround: t.isOptional(t.isBoolean()),
			enableApiExtractor: t.isOptional(t.isBoolean()),
			useCentralOutputFolder: t.isOptional(t.isBoolean()),
		}),
	),
});

/**
 * @param {import('@angular-devkit/architect').BuilderContext} context
 * @returns {Promise<t.InferType<typeof testConfiguration>>}
 */
export async function loadConfiguration(context) {
	const configs = await extractExtraConfiguration(
		{
			key: '@snuggery/angular',
			test: testConfiguration,
		},
		context,
	);

	return configs.reduce((a, b) => ({
		...a,
		...b,
		flags: {
			...a.flags,
			...b.flags,
		},
	}));
}
