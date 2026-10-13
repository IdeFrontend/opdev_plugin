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
 * Regression: the sanitizer options panel's "Start now" runs
 * `sanitizerService.runSanitizer` in a FRESH window — after
 * `vscode.openFolder` the new extension host's ProjectManager has NO cached
 * context (`setProjectContext` only ever ran in the PREVIOUS window during
 * `createdProject`). The `projectPath` getter must therefore fall back to
 * the live workspace root (`workspaceFolders[0]`), the structural guarantee
 * that the path is read from the live workspace on every read
 * (`getProjectInfo()` → `ExplorerRootUtils.getPrimaryRoot()`).
 *
 * Without the fallback the runSanitizer gate reports
 * `sanitizer.detectionFailedError: 'No sanitizer config'` on a freshly
 * created project even though the creation seeds and the seeded option
 * defaults are all present. A unit spec masked this by mocking
 * `ProjectManager.getInstance().projectPath`.
 *
 * The creation flow runs for real (REAL OpGeneratorFactory + settings/cache
 * writes); only the operator command executor is mocked so the sanitizer
 * run itself never spawns.
 */
import * as path from 'path';
import type { CreatedProjectParams } from '@shared/api-types';

import {
  creationCommandDispatcher,
  requireFresh,
  runLifecycleCase,
  setupCreationCase,
} from './helpers';

jest.mock('@plugin/service/operator-command-executor', () => ({
  buildOperatorSpawnContext: jest.fn(() => ({})),
  commandFailureMessage: jest.fn((_res: unknown, key: string) => `${key}`),
  executeOperatorCommand: jest.fn(async () => ({
    code: 0,
    output: 'ok',
    interruptedByUserStop: false,
  })),
}));

describe('sanitizer "Start now" in a fresh window (no cached project context)', () => {
  it('cann creation → fresh window (resetCachedProject) → runSanitizer never reports "No sanitizer config"', async () => {
    let projectDir = '';
    let resolvedProjectPath: string | undefined;
    let executorCalls = 0;
    let messages: Array<{ kind: string;
      text: string }> = [];

    const snapshot = await runLifecycleCase({
      setup: (root) => setupCreationCase(root, 'cann'),
      // The opened project folder IS the workspace folder: the harness config
      // mock reads <workspaceFolder>/.vscode/settings.json, and the creation
      // flow writes the project settings there (the branch writes them into
      // the project's own folder). Using the host root would read
      // a settings file the creation flow never wrote.
      workspaceFolder: (root) => path.join(root, 'op_add'),
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

        projectDir = path.join(ctx.root, 'op_add');

        // Fresh window after vscode.openFolder: the new extension host knows
        // only the workspace folder, never the previous window's cached
        // project context. Same module graph as sanitizerService (requireFresh
        // after runLifecycleCase's jest.resetModules), so this is the exact
        // instance the run reads.
        const freshProjectManager = requireFresh<{
          ProjectManager: { getInstance: ()=> { resetCachedProject: ()=> void;
            projectPath: string | undefined } }
        }>('@plugin/core/project/project-manager')
          .ProjectManager.getInstance();

        freshProjectManager.resetCachedProject();

        const { sanitizerService } = requireFresh<{
          sanitizerService: { runSanitizer: (params: { operatorNames?: string })=> Promise<void> }
        }>('@plugin/service/sanitizer-service');

        await sanitizerService.runSanitizer({});

        resolvedProjectPath = freshProjectManager.projectPath;

        const { executeOperatorCommand } = requireFresh<{
          executeOperatorCommand: jest.Mock
        }>('@plugin/service/operator-command-executor');

        executorCalls = executeOperatorCommand.mock.calls.length;
      },
    });

    messages = snapshot.messages;

    // The gate must have let the run through to the executor…
    expect(executorCalls)
      .toBeGreaterThan(0);

    // …the fallback getter must resolve the project path from the live
    // workspace folder…
    expect(resolvedProjectPath)
      .toBe(projectDir);

    // …and the "No sanitizer config" error must never appear. Any OTHER
    // failure message (e.g. an empty sanitizer report) is out of scope here.
    const noConfigErrors = messages.filter((message) =>
      message.kind === 'error' && message.text.includes('No sanitizer config'));

    expect(noConfigErrors)
      .toEqual([]);
  });
});
