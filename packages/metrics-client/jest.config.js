export default {
  displayName: 'http-client',
  preset: 'ts-jest',
  passWithNoTests: true,
  testEnvironment: 'node',
  rootDir: './src',
  testMatch: ['**/__tests__/**/*.(spec|test).ts', '**/?(*.)+(spec|test).ts'],
  globals: {
    'ts-jest': {
      tsconfig: '<rootDir>/../tsconfig.spec.json',
    },
  },
  collectCoverageFrom: ['**/*.ts', '!**/*.d.ts', '!**/index.ts'],
  setupFilesAfterEnv: ['<rootDir>/__tests__/setup.ts'],
};
