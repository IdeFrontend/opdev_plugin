/**
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 * This program is free software, you can redistribute it and/or modify it under the terms and conditions of
 * CANN Open Software License Agreement Version 2.0 (the "License").
 * Please refer to the License for details. You may not use this file except in compliance with the License.
 * THIS SOFTWARE IS PROVIDED ON AN "AS IS" BASIS, WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED,
 * INCLUDING BUT NOT LIMITED TO NON-INFRINGEMENT, MERCHANTABILITY, OR FITNESS FOR A PARTICULAR PURPOSE.
 * See LICENSE in the root of the software repository for the full text of the License.
 */
/**
 * Lifecycle test: createdProject targets `params.projectPath/projectName` —
 * NOT the current workspace folder. With the workspace folder pointing
 * elsewhere (`open_elsewhere`), the operator structure must still land under
 * the requested project path and nothing may be created under the folder.
 */
import * as fs from 'fs';
import * as path from 'path';
import type { CreatedProjectParams } from '@shared/api-types';

import {
  creationCommandDispatcher,
  requireFresh,
  runLifecycleCase,
  setupCreationCase,
} from './helpers';

describe('createdProject targets params.projectPath, not the workspace folder', () => {
  it('creates the operator under the requested path when the folder is elsewhere', async () => {
    const snapshot = await runLifecycleCase({
      setup: (root) => {
        fs.mkdirSync(path.join(root, 'open_elsewhere'), { recursive: true });
        setupCreationCase(root, 'cann');
      },
      workspaceFolder: (root) => path.join(root, 'open_elsewhere'),
      onCommand: creationCommandDispatcher(),
      run: async (ctx) => {
        const { welcomeMethods } = requireFresh<{
          welcomeMethods: {
            createdProject: (params: CreatedProjectParams)=> Promise<void>
          }
        }>('@plugin/controller/welcome-controller');

        await welcomeMethods.createdProject({
          projectPath: ctx.root,
          projectName: 'op_add',
          createOperatorProjectDictoryFileType: 1,
          templateName: 'hello_world',
        });
      },
    });

    // The full operator structure landed at the requested target path. A cann
    // creation does not materialize a cache (the last project path lives in
    // the extension global state, and cann has no sanitizer Python target).
    expect(snapshot.files['op_add/.vscode/cache.json'])
      .toBeUndefined();
    expect(snapshot.files['op_add/build.sh'])
      .toBeDefined();
    expect(snapshot.files['op_add/CMakeLists.txt'])
      .toBeDefined();

    // Nothing was created inside the workspace folder (it stays empty).
    expect(Object.keys(snapshot.files)
      .some((key) => key.startsWith('open_elsewhere/')))
      .toBe(false);
  });
});
