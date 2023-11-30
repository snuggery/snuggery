/* cspell:ignore jsons */

import {tags} from '@angular-devkit/core';
import type {RuleFactory} from '@angular-devkit/schematics';

import {journey} from '../../';
import {mapImports} from '../map-imports';
import {updatePackageJsons} from '../update-package-jsons';
import {updateWorkspace} from '../update-workspace';

// eslint-disable-next-line @typescript-eslint/ban-types
export const init: RuleFactory<{}> = () => (tree) => {
	tree.create(
		'.gitignore',
		tags.stripIndent`
			node_modules
		`,
	);

	tree.create(
		'package.json',
		JSON.stringify(
			{
				name: 'test',
				main: 'main.js',
			},
			null,
			2,
		) + '\n',
	);

	tree.create(
		'node_modules/lorem/package.json',
		JSON.stringify({
			name: 'lorem',
			main: './dist/index.cjs',
		}),
	);

	tree.create(
		'angular.json',
		tags.stripIndent`
			{
				"version": 1,
				"projects": {
					"app": {
						"root": "",
						"projectType": "application"
					}
				}
			}
		`,
	);

	tree.create(
		'file.ts',
		tags.stripIndent`
			import {unchanged, renamed, moved, renamedAndMoved as aliasedImport, Renamed, Moved, RenamedAndMoved} from '@lorem/ipsum';

			export {Renamed as NewName, Renamed, Moved, Moved as Alias} from '@lorem/ipsum';
			export {moved, moved as alias, renamed, renamed as newName};

			export const var1: Renamed<import('@lorem/ipsum').Moved>;
			export const var2: import('@lorem/ipsum').RenamedAndMoved<Moved, Renamed>;
			export const var3 = renamed(moved, aliasedImport, unchanged);
		`,
	);
};

export const replaceLoremIpsum = journey(
	mapImports('@lorem/ipsum', [
		['renamed', {newName: 'newName'}],
		['moved', {newFrom: '@dolor/sit'}],
		['renamedAndMoved', {newFrom: '@dolor/sit', newName: 'amet'}],
		['Renamed', {newName: 'NewName'}],
		['Moved', {newFrom: '@dolor/sit'}],
		['RenamedAndMoved', {newFrom: '@dolor/sit', newName: 'Amet'}],
	]),
);

export const addPrefix = journey(
	updateWorkspace((workspace) =>
		workspace.projects.forEach((project) => {
			project.prefix = 'pref';
		}),
	),
);

export const mainToExport = journey(
	updatePackageJsons((pkg) => {
		if (pkg.main) {
			pkg.exports = pkg.main.startsWith('.') ? pkg.main : `./${pkg.main}`;
			delete pkg.main;
		}
	}),
);
