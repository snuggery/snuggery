import {Cli} from 'clipanion';
import expect from 'expect';
import {Writable} from 'stream';
import {suite} from 'uvu';

import {AbstractCommand} from '../../command/abstract-command';
import type {Context} from '../../command/context';
import {parseFreeFormArguments} from '../parse-options';
import {Option, Type} from '../parse-schema';

const test = suite<{
	context: Context;
	command: AbstractCommand;
}>('option parsing');

const path = ['test'];

test.before.each(testContext => {
	testContext.context = {
		stderr: new Writable(),
	} as Context;

	class TestCommand extends AbstractCommand {
		static readonly paths = [AbstractCommand.Default];

		async execute() {
			return 0;
		}
	}

	const cli = new Cli<Context>();
	cli.register(TestCommand);

	testContext.command = cli.process([]) as AbstractCommand;

	// This sets up the command instance
	cli.run(testContext.command, testContext.context);
});

test('parseFreeFormArguments without options', ({command}) => {
	function parse(...values: string[]) {
		return parseFreeFormArguments({command, path, values});
	}

	// it should support --foo=bar
	expect(parse('--foo=bar')).toEqual([true, {foo: 'bar'}]);

	expect(parse('--foo=bar', '--lorem=ipsum')).toEqual([
		true,
		{foo: 'bar', lorem: 'ipsum'},
	]);

	// it should support --foo bar
	expect(parse('--foo', 'bar')).toEqual([true, {foo: 'bar'}]);

	expect(parse('--foo', 'bar', '--lorem', 'ipsum')).toEqual([
		true,
		{foo: 'bar', lorem: 'ipsum'},
	]);

	// it should support boolean values for --flags
	expect(parse('--foo=true')).toEqual([true, {foo: true}]);
	expect(parse('--foo')).toEqual([true, {foo: true}]);

	expect(parse('--foo', '--lorem', 'true')).toEqual([
		true,
		{foo: true, lorem: true},
	]);

	// it should support -c=lorem
	expect(parse('-c=lorem')).toEqual([true, {c: 'lorem'}]);
	expect(parse('-c=lorem', '-d=ipsum')).toEqual([
		true,
		{c: 'lorem', d: 'ipsum'},
	]);

	// it should support -c lorem
	expect(parse('-c', 'lorem')).toEqual([true, {c: 'lorem'}]);
	expect(parse('-c', 'lorem', '-d', 'ipsum')).toEqual([
		true,
		{c: 'lorem', d: 'ipsum'},
	]);

	// it should support numbers
	expect(parse('-c', '2')).toEqual([true, {c: 2}]);
	expect(parse('--input', '20.20')).toEqual([true, {input: 20.2}]);

	// it should support boolean values for -flags
	expect(parse('-c=true')).toEqual([true, {c: true}]);
	expect(parse('-c')).toEqual([true, {c: true}]);
	expect(parse('-c', '-d', 'false')).toEqual([true, {c: true, d: false}]);
	expect(parse('-cd', 'false')).toEqual([true, {c: true, d: false}]);
	expect(parse('-cd=false')).toEqual([true, {c: true, d: false}]);

	// it should support combinations of all options
	expect(parse('-abc', '-def', '2', '--lorem', '--ipsum', 'dolor')).toEqual([
		true,
		{
			a: true,
			b: true,
			c: true,
			d: true,
			e: true,
			f: 2,
			lorem: true,
			ipsum: 'dolor',
		},
	]);
});

test('parseFreeFormArguments with options', ({command}) => {
	const option: Option = {
		aliases: ['l', 'lor'],
		hasDefault: false,
		hidden: false,
		name: 'lorem',
		required: false,
		type: Type.String,
	};

	function parse(...values: string[]) {
		return parseFreeFormArguments({command, path, values, options: [option]});
	}

	// it should support long aliases
	expect(parse('--lorem', 'ipsum')).toEqual([true, {lorem: 'ipsum'}]);
	expect(parse('--lor', 'ipsum')).toEqual([true, {lorem: 'ipsum'}]);
	expect(parse('-l', 'ipsum')).toEqual([true, {lorem: 'ipsum'}]);

	// it should support short aliases
	expect(parse('-l', 'ipsum')).toEqual([true, {lorem: 'ipsum'}]);
});

test.run();
