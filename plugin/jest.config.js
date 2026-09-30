/**
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 * This program is free software, you can redistribute it and/or modify it under the terms and conditions of
 * CANN Open Software License Agreement Version 2.0 (the "License").
 * Please refer to the License for details. You may not use this file except in compliance with the License.
 * THIS SOFTWARE IS PROVIDED ON AN "AS IS" BASIS, WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED,
 * INCLUDING BUT NOT LIMITED TO NON-INFRINGEMENT, MERCHANTABILITY, OR FITNESS FOR A PARTICULAR PURPOSE.
 * See LICENSE in the root of the software repository for the full text of the License.
 */
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
