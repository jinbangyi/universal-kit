export default {
  displayName: 'http-client',
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: './src',
  testMatch: ['**/__tests__/**/*.ts', '**/?(*.)+(spec|test).ts'],
  collectCoverageFrom: ['**/*.ts', '!**/*.d.ts', '!**/index.ts'],
  setupFilesAfterEnv: ['<rootDir>/__tests__/setup.ts'],
};
