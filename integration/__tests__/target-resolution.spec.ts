import expect from 'expect';
import {suite} from 'uvu';

import {inFixture} from './setup';

const test = suite('target resolution');

test(
	'it builds the correct targets with project with a single configured project',
	inFixture('single-project', async ({runJson}) => {
		await expect(runJson(['build', 'fixture'])).resolves.toMatchObject({
			project: 'fixture',
			target: 'build',
		});
		await expect(runJson(['test', 'fixture'])).resolves.toMatchObject({
			project: 'fixture',
			target: 'test',
		});

		await expect(
			runJson(['lint', 'fixture', '--configuration', 'foo']),
		).resolves.toMatchObject({
			project: 'fixture',
			target: 'lint',
			configuration: 'foo',
		});
	}),
);

test(
	'it builds the correct targets without project with a single configured project',
	inFixture('single-project', async ({runJson}) => {
		await expect(runJson(['build'])).resolves.toMatchObject({
			project: 'fixture',
			target: 'build',
		});
		await expect(runJson(['test'])).resolves.toMatchObject({
			project: 'fixture',
			target: 'test',
		});

		await expect(
			runJson(['lint', '--configuration', 'foo']),
		).resolves.toMatchObject({
			project: 'fixture',
			target: 'lint',
			configuration: 'foo',
		});
	}),
);

test(
	'it runs the correct target when a project is specified with multiple configured projects',
	inFixture('multiple-projects', async ({runJson}) => {
		await expect(runJson(['build', 'root'])).resolves.toMatchObject({
			project: 'root',
			target: 'build',
		});

		await expect(runJson(['test', 'one'])).resolves.toMatchObject({
			project: 'one',
			target: 'test',
		});

		await expect(runJson(['test', 'two'])).resolves.toMatchObject({
			project: 'two',
			target: 'test',
		});
	}),
);

test(
	'it runs the correct target if the current project has the target with multiple configured projects',
	inFixture('multiple-projects', async ({runJson}) => {
		await expect(runJson(['build'])).resolves.toMatchObject({
			project: 'root',
			target: 'build',
		});

		await expect(
			runJson(['build'], {cwd: 'projects/one'}),
		).resolves.toMatchObject({
			project: 'one',
			target: 'build',
		});

		await expect(
			runJson(['test'], {cwd: 'projects/two'}),
		).resolves.toMatchObject({
			project: 'two',
			target: 'test',
		});
	}),
);

test(
	'it runs the correct target if only one project has the specified target with multiple configured projects',
	inFixture('multiple-projects', async ({runJson}) => {
		await expect(runJson(['lint'])).resolves.toMatchObject({
			project: 'root',
			target: 'lint',
		});

		await expect(
			runJson(['lint'], {cwd: 'projects/one'}),
		).resolves.toMatchObject({
			project: 'root',
			target: 'lint',
		});

		await expect(
			runJson(['lint'], {cwd: 'projects/two'}),
		).resolves.toMatchObject({
			project: 'root',
			target: 'lint',
		});
	}),
);

test(
	'it runs the correct target if the default project has the target with multiple configured projects',
	inFixture('multiple-projects', async ({runJson}) => {
		await expect(runJson(['build'])).resolves.toMatchObject({
			project: 'root',
			target: 'build',
		});

		await expect(
			runJson(['build'], {cwd: 'projects/one'}),
		).resolves.toMatchObject({
			project: 'one',
			target: 'build',
		});

		await expect(
			runJson(['build'], {cwd: 'projects/two'}),
		).resolves.toMatchObject({
			project: 'root',
			target: 'build',
		});
	}),
);

test(
	'it uses any passed in configuration with defaultConfiguration',
	inFixture('single-project', async ({runJson}) => {
		await expect(
			runJson(['with-default--target', '-c', 'ipsum']),
		).resolves.toMatchObject({
			project: 'fixture',
			target: 'with-default--target',
			configuration: 'ipsum',
		});

		await expect(
			runJson(['with-default--value', '-c', 'ipsum']),
		).resolves.toMatchObject({
			configuration: 'ipsum',
		});
	}),
);

test(
	'it uses the default configuration if no config is passed with defaultConfiguration',
	inFixture('single-project', async ({runJson}) => {
		await expect(runJson(['with-default--target'])).resolves.toMatchObject({
			project: 'fixture',
			target: 'with-default--target',
		});

		await expect(runJson(['with-default--value'])).resolves.toMatchObject({
			configuration: 'lorem',
		});
	}),
);

test.run();
