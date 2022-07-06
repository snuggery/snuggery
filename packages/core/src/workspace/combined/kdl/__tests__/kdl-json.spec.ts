import {parse} from '@bgotink/kdl';
import expect from 'expect';
import {suite} from 'uvu';

import {toJsonObject, toJsonValue} from '../kdl-json';

const test = suite('kdl-json');

test('toJsonValue should work for simple values', () => {
	expect(toJsonValue(parse(String.raw`node "lorem"`, {as: 'node'}))).toBe(
		'lorem',
	);
});

test('toJsonObject should work for objects', () => {
	expect(
		toJsonObject(parse(String.raw`parent { node "lorem"; }`, {as: 'node'})),
	).toEqual({node: 'lorem'});
});

test('toJsonObject should work for when passing arrays', () => {
	expect(
		toJsonObject(
			parse(
				String.raw`parent {
				node "lorem" object=true
				node "ipsum"
		}`,
				{as: 'node'},
			),
		),
	).toEqual({
		node: [
			{
				object: true,
				$implicit: 'lorem',
			},
			'ipsum',
		],
	});
});

test.run();
