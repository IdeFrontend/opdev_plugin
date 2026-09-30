/**
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 * This program is free software, you can redistribute it and/or modify it under the terms and conditions of
 * CANN Open Software License Agreement Version 2.0 (the "License").
 * Please refer to the License for details. You may not use this file except in compliance with the License.
 * THIS SOFTWARE IS PROVIDED ON AN "AS IS" BASIS, WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED,
 * INCLUDING BUT NOT LIMITED TO NON-INFRINGEMENT, MERCHANTABILITY, OR FITNESS FOR A PARTICULAR PURPOSE.
 * See LICENSE in the root of the software repository for the full text of the License.
 */
import { validateGuardedFile } from '../../../../scripts/check-staged-huawei-flavor';

describe('check-staged-huawei-flavor', () => {
  it('accepts Huawei package.json while ignoring flavor script names in scripts', () => {
    const content = JSON.stringify({
      name: 'huawei-op-devtools-vscode-plugin',
      displayName: 'Huawei OP DevTools',
      publisher: 'huawei',
      activationEvents: ['onView:opdevtoolsHomeTree'],
      contributes: {
        commands: [{ command: 'huawei-op-devtools.open' }],
        configuration: [{ id: 'op-devtools.operatorSupport' }],
      },
      scripts: { 'apply-flavor:ascend-c-toolkit': 'tsx scripts/apply-flavor.ts ascend-c-toolkit' },
    }, null, 2);

    expect(validateGuardedFile('package.json', content))
      .toEqual([]);
  });

  it('rejects Ascend manifest content in package.json', () => {
    const content = JSON.stringify({
      name: 'asc-toolkit',
      displayName: 'Ascend C Toolkits',
      publisher: 'cann-pub',
      activationEvents: ['onView:ascendCToolkitHomeTree'],
      contributes: { commands: [{ command: 'ascend-c-toolkit.open' }] },
    }, null, 2);

    const errors = validateGuardedFile('package.json', content);

    expect(errors.length)
      .toBeGreaterThan(0);
    expect(errors.join('\n'))
      .toMatch(/Ascend C Toolkits/);
  });

  it('rejects manifest with commandPrefix used for configuration categories', () => {
    const content = JSON.stringify({
      name: 'huawei-op-devtools-vscode-plugin',
      displayName: 'Huawei OP DevTools',
      publisher: 'huawei',
      contributes: {
        commands: [{ command: 'huawei-op-devtools.open' }],
        configuration: [{ id: 'huawei-op-devtools.sanitizer' }],
      },
    }, null, 2);

    const errors = validateGuardedFile('package.json', content);

    expect(errors.some((error) => error.includes('commandPrefix')))
      .toBe(true);
  });
});
