/**
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 * This program is free software, you can redistribute it and/or modify it under the terms and conditions of
 * CANN Open Software License Agreement Version 2.0 (the "License").
 * Please refer to the License for details. You may not use this file except in compliance with the License.
 * THIS SOFTWARE IS PROVIDED ON AN "AS IS" BASIS, WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED,
 * INCLUDING BUT NOT LIMITED TO NON-INFRINGEMENT, MERCHANTABILITY, OR FITNESS FOR A PARTICULAR PURPOSE.
 * See LICENSE in the root of the software repository for the full text of the License.
 */
import fs from 'node:fs';
import path from 'node:path';

import { DEFAULT_ST_TEST_ARGUMENTS } from '@shared/st-test-options';

const REPO_ROOT = path.resolve(__dirname, '../../../..');

type ConfigurationProperty = {
  type?: string;
  scope?: string;
  default?: unknown;
  items?: {
    type?: string;
    enum?: string[];
  };
};

describe('ST test options contribution', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf8')) as {
    contributes: {
      configuration: Array<{
        id: string;
        properties: Record<string, ConfigurationProperty>;
      }>;
    };
  };

  it('contributes resource-scoped per-mode token arrays with safe defaults', () => {
    const category = manifest.contributes.configuration
      .find((entry) => entry.id === 'op-devtools.stTest');

    expect(category)
      .toBeDefined();
    expect(category?.properties['op-devtools.stTest.selectedModes'])
      .toMatchObject({
        type: 'array',
        scope: 'resource',
        default: ['kernel'],
        items: {
          type: 'string',
          enum: [
            'kernel',
            'aclnn',
            'e2e',
          ],
        },
      });
    expect(category?.properties['op-devtools.stTest.kernel.arguments'])
      .toMatchObject({
        type: 'array',
        scope: 'resource',
        default: DEFAULT_ST_TEST_ARGUMENTS.kernel,
        items: { type: 'string' },
      });
    expect(category?.properties['op-devtools.stTest.aclnn.arguments']?.default)
      .toEqual(DEFAULT_ST_TEST_ARGUMENTS.aclnn);
    expect(category?.properties['op-devtools.stTest.e2e.arguments']?.default)
      .toEqual(DEFAULT_ST_TEST_ARGUMENTS.e2e);
  });

  it('registers a buildable panel entry with the theme bridge', () => {
    const providerSource = fs.readFileSync(
      path.join(REPO_ROOT, 'plugin/src/class/webview-provider.ts'),
      'utf8',
    );
    const appSource = fs.readFileSync(
      path.join(REPO_ROOT, 'web/src/views/panels/options-st-test/app.vue'),
      'utf8',
    );

    expect(providerSource)
      .toContain("'options-st-test'");
    expect(providerSource)
      .toContain('`panels/${router}`');
    expect(appSource)
      .toContain('useTheme');
    expect(appSource)
      .toContain('<a-config-provider');
  });
});
