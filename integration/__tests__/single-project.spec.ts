describe('single project', () => {
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
