describe('builder resolution', () => {
	describe('builder via package', () => {
		it(
			'should run',
			inFixture('builders', async ({runJson}) => {
				await expect(
					runJson(['run', 'target', 'fixture:installed-builder']),
				).resolves.toMatchObject({
					withDefault: 'defaultValue',
				});
			}),
		);

		it(
			'should run with arguments',
			inFixture('builders', async ({runJson}) => {
				await expect(
					runJson([
						'run',
						'target',
						'fixture:installed-builder',
						'--foo',
						'bar',
						'--with-default',
						'baz',
					]),
				).resolves.toMatchObject({
					foo: 'bar',
					withDefault: 'baz',
				});
			}),
		);
	});

	describe('builder via local builders.json', () => {
		it(
			'should run',
			inFixture('builders', async ({runJson}) => {
				await expect(
					runJson(['run', 'target', 'fixture:local-builder']),
				).resolves.toMatchObject({
					withDefault: 'defaultValue',
				});
			}),
		);

		it(
			'should run with arguments',
			inFixture('builders', async ({runJson}) => {
				await expect(
					runJson([
						'run',
						'target',
						'fixture:local-builder',
						'--foo',
						'bar',
						'--with-default',
						'baz',
					]),
				).resolves.toMatchObject({
					foo: 'bar',
					withDefault: 'baz',
				});
			}),
		);
	});

	describe('builder via local builder.json', () => {
		it(
			'should run',
			inFixture('builders', async ({runJson}) => {
				await expect(
					runJson(['run', 'target', 'fixture:local-builder-single']),
				).resolves.toMatchObject({
					withDefault: 'defaultValue',
				});
			}),
		);

		it(
			'should run with arguments',
			inFixture('builders', async ({runJson}) => {
				await expect(
					runJson([
						'run',
						'target',
						'fixture:local-builder-single',
						'--foo',
						'bar',
						'--with-default',
						'baz',
					]),
				).resolves.toMatchObject({
					foo: 'bar',
					withDefault: 'baz',
				});
			}),
		);
	});

	describe('builder via implementation', () => {
		it(
			'should run',
			inFixture('builders', async ({runJson}) => {
				await expect(
					runJson(['run', 'target', 'fixture:local-builder-implementation']),
				).resolves.toMatchObject({});
			}),
		);

		it(
			'should run with arguments',
			inFixture('builders', async ({runJson}) => {
				await expect(
					runJson([
						'run',
						'target',
						'fixture:local-builder-implementation',
						'--foo',
						'bar',
						'--with-default',
						'baz',
					]),
				).resolves.toMatchObject({
					foo: 'bar',
					withDefault: 'baz',
				});
			}),
		);
	});

	describe('builder via schema', () => {
		it(
			'should run',
			inFixture('builders', async ({runJson}) => {
				await expect(
					runJson(['run', 'target', 'fixture:local-builder-schema']),
				).resolves.toMatchObject({
					withDefault: 'defaultValue',
				});
			}),
		);

		it(
			'should run with arguments',
			inFixture('builders', async ({runJson}) => {
				await expect(
					runJson([
						'run',
						'target',
						'fixture:local-builder-schema',
						'--foo',
						'bar',
						'--with-default',
						'baz',
					]),
				).resolves.toMatchObject({
					foo: 'bar',
					withDefault: 'baz',
				});
			}),
		);
	});
});
