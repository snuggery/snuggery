import {Cli, type BaseContext as Context} from 'clipanion';
import assert from 'node:assert/strict';
import {Writable} from 'node:stream';
import {suite} from 'uvu';

import {AbstractCommand} from '../../command/abstract-command';
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
	assert.deepEqual(parse('--foo=bar'), [true, {foo: 'bar'}]);

	assert.deepEqual(parse('--foo=bar', '--lorem=ipsum'), [
		true,
		{foo: 'bar', lorem: 'ipsum'},
	]);

	// it should support --foo bar
	assert.deepEqual(parse('--foo', 'bar'), [true, {foo: 'bar'}]);

	assert.deepEqual(parse('--foo', 'bar', '--lorem', 'ipsum'), [
		true,
		{foo: 'bar', lorem: 'ipsum'},
	]);

	// it should support boolean values for --flags
	assert.deepEqual(parse('--foo=true'), [true, {foo: true}]);
	assert.deepEqual(parse('--foo'), [true, {foo: true}]);

	assert.deepEqual(parse('--foo', '--lorem', 'true'), [
		true,
		{foo: true, lorem: true},
	]);

	// it should support -c=lorem
	assert.deepEqual(parse('-c=lorem'), [true, {c: 'lorem'}]);
	assert.deepEqual(parse('-c=lorem', '-d=ipsum'), [
		true,
		{c: 'lorem', d: 'ipsum'},
	]);

	// it should support -c lorem
	assert.deepEqual(parse('-c', 'lorem'), [true, {c: 'lorem'}]);
	assert.deepEqual(parse('-c', 'lorem', '-d', 'ipsum'), [
		true,
		{c: 'lorem', d: 'ipsum'},
	]);

	// it should support numbers
	assert.deepEqual(parse('-c', '2'), [true, {c: 2}]);
	assert.deepEqual(parse('--input', '20.20'), [true, {input: 20.2}]);

	// it should support boolean values for -flags
	assert.deepEqual(parse('-c=true'), [true, {c: true}]);
	assert.deepEqual(parse('-c'), [true, {c: true}]);
	assert.deepEqual(parse('-c', '-d', 'false'), [true, {c: true, d: false}]);
	assert.deepEqual(parse('-cd', 'false'), [true, {c: true, d: false}]);
	assert.deepEqual(parse('-cd=false'), [true, {c: true, d: false}]);

	// it should support combinations of all options
	assert.deepEqual(parse('-abc', '-def', '2', '--lorem', '--ipsum', 'dolor'), [
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
		hidden: false,
		name: 'lorem',
		required: false,
		type: Type.String,
	};

	function parse(...values: string[]) {
		return parseFreeFormArguments({command, path, values, options: [option]});
	}

	// it should support long aliases
	assert.deepEqual(parse('--lorem', 'ipsum'), [true, {lorem: 'ipsum'}]);
	assert.deepEqual(parse('--lor', 'ipsum'), [true, {lorem: 'ipsum'}]);
	assert.deepEqual(parse('-l', 'ipsum'), [true, {lorem: 'ipsum'}]);

	// it should support short aliases
	assert.deepEqual(parse('-l', 'ipsum'), [true, {lorem: 'ipsum'}]);
});

test.run();
