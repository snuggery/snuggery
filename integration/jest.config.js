module.exports = {
  rootDir: '.',

  setupFilesAfterEnv: ['<rootDir>/setup.ts'],
  testMatch: ['<rootDir>/__tests__/**/*.spec.ts'],

  transform: {
    '^.+\\.tsx?$': require.resolve('ts-jest', {
      paths: [require.resolve('../package.json')],
    }),
  },

  testEnvironment: 'node',
  globals: {
    'ts-jest': {
      tsconfig: '<rootDir>/tsconfig.json',
    },
  },
};
