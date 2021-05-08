describe('target resolution', () => {
  describe('with a single project', () => {
    it(
      'should build the correct targets with project',
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

    it(
      'should build the correct targets without project',
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
  });

  describe('with multiple projects', () => {
    it(
      'should run the correct target when a project is specified',
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

    it(
      'should run the correct target if the current project has the target',
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

    it(
      'should run the correct target if only one project has the specified target',
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

    it(
      'should run the correct target if the default project has the target',
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
  });

  describe('with defaultConfiguration', () => {
    it(
      'should use any passed in configuration',
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

    it(
      'should use the default configuration if no config is passed',
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
  });
});
