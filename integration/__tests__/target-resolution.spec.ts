import assert from 'node:assert/strict';
import {suite} from 'uvu';

import {inFixture} from './setup';

const test = suite('target resolution');

function matchObject(actual: unknown, expected: Record<string, unknown>) {
	assert.equal(typeof actual, 'object');
	assert.ok(actual);
	assert.equal(Array.isArray(actual), false);

	assert.deepEqual(
		Object.fromEntries(
			Object.entries(actual as Record<string, unknown>).filter(([key]) =>
				Reflect.has(expected, key),
			),
		),
		expected,
	);
}

test(
	'it builds the correct targets with project with a single configured project',
	inFixture('single-project', async ({runJson}) => {
		matchObject(await runJson(['build', 'fixture']), {
			project: 'fixture',
			target: 'build',
		});
		matchObject(await runJson(['test', 'fixture']), {
			project: 'fixture',
			target: 'test',
		});

		matchObject(await runJson(['lint', 'fixture', '--configuration', 'foo']), {
			project: 'fixture',
			target: 'lint',
			configuration: 'foo',
		});
	}),
);

test(
	'it builds the correct targets without project with a single configured project',
	inFixture('single-project', async ({runJson}) => {
		matchObject(await runJson(['build']), {
			project: 'fixture',
			target: 'build',
		});
		matchObject(await runJson(['test']), {
			project: 'fixture',
			target: 'test',
		});

		matchObject(await runJson(['lint', '--configuration', 'foo']), {
			project: 'fixture',
			target: 'lint',
			configuration: 'foo',
		});
	}),
);

test(
	'it runs the correct target when a project is specified with multiple configured projects',
	inFixture('multiple-projects', async ({runJson}) => {
		matchObject(await runJson(['build', 'root']), {
			project: 'root',
			target: 'build',
		});

		matchObject(await runJson(['test', 'one']), {
			project: 'one',
			target: 'test',
		});

		matchObject(await runJson(['test', 'two']), {
			project: 'two',
			target: 'test',
		});
	}),
);

test(
	'it runs the correct target if the current project has the target with multiple configured projects',
	inFixture('multiple-projects', async ({runJson}) => {
		matchObject(await runJson(['build']), {
			project: 'root',
			target: 'build',
		});

		matchObject(await runJson(['build'], {cwd: 'projects/one'}), {
			project: 'one',
			target: 'build',
		});

		matchObject(await runJson(['test'], {cwd: 'projects/two'}), {
			project: 'two',
			target: 'test',
		});
	}),
);

test(
	'it runs the correct target if only one project has the specified target with multiple configured projects',
	inFixture('multiple-projects', async ({runJson}) => {
		matchObject(await runJson(['lint']), {
			project: 'root',
			target: 'lint',
		});

		matchObject(await runJson(['lint'], {cwd: 'projects/one'}), {
			project: 'root',
			target: 'lint',
		});

		matchObject(await runJson(['lint'], {cwd: 'projects/two'}), {
			project: 'root',
			target: 'lint',
		});
	}),
);

test(
	'it runs the correct target if the default project has the target with multiple configured projects',
	inFixture('multiple-projects', async ({runJson}) => {
		matchObject(await runJson(['build']), {
			project: 'root',
			target: 'build',
		});

		matchObject(await runJson(['build'], {cwd: 'projects/one'}), {
			project: 'one',
			target: 'build',
		});

		matchObject(await runJson(['build'], {cwd: 'projects/two'}), {
			project: 'root',
			target: 'build',
		});
	}),
);

test(
	'it uses any passed in configuration with defaultConfiguration',
	inFixture('single-project', async ({runJson}) => {
		matchObject(await runJson(['with-default--target', '-c', 'ipsum']), {
			project: 'fixture',
			target: 'with-default--target',
			configuration: 'ipsum',
		});

		matchObject(await runJson(['with-default--value', '-c', 'ipsum']), {
			configuration: 'ipsum',
		});
	}),
);

test(
	'it uses the default configuration if no config is passed with defaultConfiguration',
	inFixture('single-project', async ({runJson}) => {
		matchObject(await runJson(['with-default--target']), {
			project: 'fixture',
			target: 'with-default--target',
		});

		matchObject(await runJson(['with-default--value']), {
			configuration: 'lorem',
		});
	}),
);

test.run();
