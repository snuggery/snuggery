'use strict';
// @ts-check

/** @type {import('@jest/types').Config.InitialOptions} */
module.exports = {
  testEnvironment: 'node',
  transform: {
    '^.+\\.tsx?$': 'ts-jest',
  },
  testMatch: ['<rootDir>/packages/*/src/**/__tests__/**/*.spec.ts'],
  modulePathIgnorePatterns: ['<rootDir>/packages/*/dist'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
};
