module.exports = {
	rootDir: '.',

	testMatch: ['<rootDir>/packages/*/src/**/__tests__/**/*.spec.ts'],

	transform: {
		'^.+\\.tsx?$': require.resolve('ts-jest'),
	},

	testEnvironment: 'node',
	globals: {
		'ts-jest': {
			tsconfig: '<rootDir>/tsconfig.json',
		},
	},

	modulePathIgnorePatterns: ['<rootDir>/packages/*/dist'],
};
