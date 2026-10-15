/**
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 * This program is free software, you can redistribute it and/or modify it under the terms and conditions of
 * CANN Open Software License Agreement Version 2.0 (the "License").
 * Please refer to the License for details. You may not use this file except in compliance with the License.
 * THIS SOFTWARE IS PROVIDED ON AN "AS IS" BASIS, WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED,
 * INCLUDING BUT NOT LIMITED TO NON-INFRINGEMENT, MERCHANTABILITY, OR FITNESS FOR A PARTICULAR PURPOSE.
 * See LICENSE in the root of the software repository for the full text of the License.
 */
import { resolveVsixFileName } from '../../../../scripts/package-extension';

describe('package-extension', () => {
  it('uses the flavor vsixBaseName for the ascend-c-toolkit flavor', () => {
    expect(resolveVsixFileName({
      name: 'asc-toolkit',
      publisher: 'cann-pub',
      version: '1.4.6',
    }))
      .toBe('ascend-c-toolkit-1.4.6.vsix');
  });

  it('defaults to the manifest name for the huawei flavor', () => {
    expect(resolveVsixFileName({
      name: 'huawei-op-devtools-vscode-plugin',
      publisher: 'huawei',
      version: '1.4.6',
    }))
      .toBe('huawei-op-devtools-vscode-plugin-1.4.6.vsix');
  });

  it('falls back to the manifest name for unknown extension ids', () => {
    expect(resolveVsixFileName({
      name: 'other-extension',
      publisher: 'other-publisher',
      version: '0.0.1',
    }))
      .toBe('other-extension-0.0.1.vsix');
  });
});
