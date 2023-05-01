import {tags} from '@angular-devkit/core';
import type {RuleFactory} from '@angular-devkit/schematics';

import {journey} from '../../';
import {mapImports} from '../map-imports';

// eslint-disable-next-line @typescript-eslint/ban-types
export const init: RuleFactory<{}> = () => tree => {
	tree.create(
		'file.ts',
		tags.stripIndent`
			import {renamed, moved, renamedAndMoved, Renamed, Moved, RenamedAndMoved} from '@lorem/ipsum';

			export {Renamed as NewName, Renamed, Moved, Moved as Alias} from '@lorem/ipsum';
			export {moved, moved as alias, renamed, renamed as newName};

			export const var1: Renamed<import('@lorem/ipsum').Moved>;
			export const var2: import('@lorem/ipsum').RenamedAndMoved<Moved, Renamed>;
			export const var3 = renamed(moved, renamedAndMoved);
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
