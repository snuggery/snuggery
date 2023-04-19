import assert from 'node:assert/strict';
import {cpus} from 'node:os';
import {suite} from 'uvu';

import {calculate} from '../calculator';

const test = suite('parallel calculator');

const numberOfCpus = cpus().length;

test('it returns numbers', () => {
	assert.equal(calculate(10), 10);
	assert.equal(calculate(20), 20);

	assert.equal(calculate('117'), 117);
	assert.equal(calculate('23'), 23);
});

test('it performs calculations', () => {
	assert.equal(calculate('10 + 20'), 30);
	assert.equal(calculate('10 - 20'), -10);
	assert.equal(calculate('10 * 20'), 200);
	assert.equal(calculate('10 / 20'), 0.5);

	assert.equal(calculate('10 + (20 / 2)'), 20);
	assert.equal(calculate('(10 + 20) / 2'), 15);
});

test('it has a cpuCount constant', () => {
	assert.equal(calculate('cpuCount'), numberOfCpus);

	assert.equal(calculate('cpuCount - 2'), numberOfCpus - 2);
	assert.equal(calculate('cpuCount / 2 - 1'), numberOfCpus / 2 - 1);
});

test.run();
