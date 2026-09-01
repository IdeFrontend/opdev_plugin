// Avoid slow or hanging SOC autodetection (find / + asys) when tests import ascend-util.
if (!process.env.SOC_VERSION) {
  process.env.SOC_VERSION = 'ascend910b';
}

module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  // Lifecycle parity flows (fresh install + create/open + cache writes) exceed
  // the 5s jest default under full-run load; 30s ceiling for the whole run.
  testTimeout: 30000,
  setupFilesAfterEnv: ['<rootDir>/src/__tests__/jest-setup.ts'],
  roots: ['<rootDir>/src'],
  testMatch: [
    '**/__tests__/**/*.spec.ts',
    '**/?(*.)+(spec|test).ts',
  ],
  moduleNameMapper: {
    '^vscode$': '<rootDir>/src/__tests__/__mocks__/vscode.ts',
    '^@plugin/(.*)$': '<rootDir>/src/$1',
    '^@shared/(.*)$': '<rootDir>/../shared/$1',
  },
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/**/__tests__/**',
    '!src/**/index.ts',
  ],
  coverageThreshold: {
    global: {
      branches: 90,
      functions: 90,
      lines: 90,
      statements: 90,
    },
  },
  coverageDirectory: '<rootDir>/coverage',
  verbose: true,
};
