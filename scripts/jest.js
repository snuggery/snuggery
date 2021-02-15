const {createBuilder} = require('@angular-devkit/architect');
const {runCLI} = require('jest');
const {join} = require('path');

module.exports = createBuilder(async (options, context) => {
  const {results} = await runCLI(
    {
      rootDir: context.workspaceRoot,

      setupFilesAfterEnv: mapJestFilesOption(options.setupFilesAfterEnv),
      testMatch: mapJestFilesOption(options.testMatch),
      modulePathIgnorePatterns: mapJestFilesOption(
        options.modulePathIgnorePatterns,
      ),

      moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
      testEnvironment: 'node',
      transform: JSON.stringify({
        '^.+\\.tsx?$': require.resolve('ts-jest'),
      }),
      globals: JSON.stringify({
        'ts-jest': {
          tsconfig: join('<rootDir>', options.tsConfig),
        },
      }),

      watch: options.watch,
      updateSnapshot: options.updateSnapshot,
    },
    [
      join(
        context.workspaceRoot,
        (await context.getProjectMetadata(context.target.project)).root,
      ),
    ],
  );

  return {success: results.success};
});

function mapJestFilesOption(files) {
  // Can't use ?. until node 12 EOL
  return files && files.map(f => join('<rootDir>', f));
}
