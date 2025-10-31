module.exports = {
  displayName: 'logger',
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: './src',
  testMatch: ['**/__tests__/**/*.ts', '**/?(*.)+(spec|test).ts'],
  globals: {
    'ts-jest': {
      tsconfig: {
        allowJs: true,
        isolatedModules: true,
      },
    },
  },
  collectCoverageFrom: ['**/*.ts', '!**/*.d.ts', '!**/index.ts'],
};
