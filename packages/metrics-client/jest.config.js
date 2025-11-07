export default {
  displayName: 'http-client',
  preset: 'ts-jest',
  passWithNoTests: true,
  testEnvironment: 'node',
  rootDir: './src',
  testMatch: ['**/__tests__/**/*.(spec|test).ts', '**/?(*.)+(spec|test).ts'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  extensionsToTreatAsEsm: ['.ts'],
  collectCoverageFrom: ['**/*.ts', '!**/*.d.ts', '!**/index.ts'],
  transform: {
    '^.+\\.(ts|tsx)$': ['ts-jest', {
      tsconfig: '<rootDir>/../tsconfig.spec.json',
      useESM: true,
    }],
  },
};
