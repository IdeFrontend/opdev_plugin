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

const REPO_ROOT = path.resolve(__dirname, '../../../..');
const CURRENT_GUIDE_URL = 'https://gitcode.com/opdevtools/plugin_release';
const OUTDATED_DISCUSSION_URL = 'https://gitcode.com/org/cann/discussions/54';

const userFacingHelpFiles = [
  'plugin/src/extension.ts',
  'web/src/views/sidebars/home/app.vue',
  'plugin/templates/code_template/cann_template/addn_custom/README.md',
  'plugin/templates/code_template/cann_template/hello_world/README.md',
  'plugin/templates/code_template/cann_template/torch_library_template/README.md',
];

describe('plugin release help links', () => {
  it('routes packaged help entrypoints and template docs to the maintained plugin_release guide', () => {
    const staleFiles = userFacingHelpFiles.filter((relativePath) => {
      const content = fs.readFileSync(path.join(REPO_ROOT, relativePath), 'utf8');

      return content.includes(OUTDATED_DISCUSSION_URL) || !content.includes(CURRENT_GUIDE_URL);
    });

    expect(staleFiles)
      .toEqual([]);
  });
});
