module.exports = {
  displayName: 'example',
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: './src',
  testMatch: ['**/__tests__/**/*.ts', '**/?(*.)+(spec|test).ts'],
  transform: {
    '^.+\\.ts$': 'ts-jest',
  },
  moduleNameMapping: {
    '^@universal-kit/logger$': '<rootDir>/../../packages/logger/src/index.ts',
    '^@universal-kit/metrics-client$':
      '<rootDir>/../../packages/metrics-client/src/index.ts',
    '^@universal-kit/otel$': '<rootDir>/../../packages/otel/src/index.ts',
  },
};
