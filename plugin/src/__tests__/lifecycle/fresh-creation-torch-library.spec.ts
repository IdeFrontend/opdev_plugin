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
 * Lifecycle test: creating a torch_library project (viewId CANN +
 * templateName 'torch_library_template') must reproduce the seed special case
 * for torch_library_template — `target_file = 'python ../run.py'`
 * (model.ts:720-722, `completeProjectConfigs` targetFile) instead of the
 * generic `build/<op>`:
 *
 *  - the settings seed writes
 *    `compileAndDeploy.buildConfig.deployCommandOrRunCommand` = 'python ../run.py'
 *    for the created project (not `build/op_add`);
 *  - `cache.sanitizerPythonTarget[op]` = 'python ../run.py' (the
 *    generateStructure sanitizer row used the same targetFile, model.ts:405-409);
 *  - `op-devtools.projectType` = 'cann' — createdProject passes
 *    `viewIdToProjectType(createOperatorProjectDictoryFileType)` into init
 *    (welcome-controller.ts:327-336).
 *
 * The run/sanitize commands through the REAL chain then read these seeds and
 * must match the golden torch_library etalon tails (`... && python ../run.py`,
 * golden/expected/golden.json torch_library block).
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

/** Live config backed by one settings.json file (mirrors the harness helper). */
function liveSettingsConfig(settingsFile: string): {
  get: jest.Mock;
  inspect: jest.Mock;
  update: jest.Mock;
} {
  const readLive = (): Record<string, unknown> => {
    if (!fs.existsSync(settingsFile)) {
      return {};
    }

    try {
      const parsed = JSON.parse(fs.readFileSync(settingsFile, 'utf8')) as Record<string, unknown>;

      return parsed && typeof parsed === 'object' ? parsed : {};
    }
    catch {
      return {};
    }
  };
  const lookup = (store: Record<string, unknown>, key: string): unknown => {
    if (key in store) {
      return store[key];
    }

    const dotted = `op-devtools.${key}`;

    return dotted in store ? store[dotted] : undefined;
  };

  return {
    get: jest.fn((key: string, def?: unknown) => {
      const store = readLive();
      const value = lookup(store, key);

      return value !== undefined ? value : def;
    }),
    inspect: jest.fn((key: string) => {
      const store = readLive();
      const value = lookup(store, key);

      return value !== undefined
        ? {
          key,
          workspaceValue: value,
        }
        : undefined;
    }),
    update: jest.fn(() => Promise.resolve()),
  };
}

describe('torch_library creation reproduces the base python ../run.py seeds', () => {
  it('creation with torch_library_template seeds deployCommandOrRunCommand, the sanitizer target, projectType and the real run/sanitize chains', async () => {
    let deployTarget: unknown;
    let projectTypeSetting: unknown;
    let cacheSanitizerTarget: string | undefined;
    let runtimeTarget: string | null | undefined;
    let runCommand: string | undefined;
    let sanitizerCommand: string | undefined;

    await runLifecycleCase({
      setup: (root) => setupCreationCase(root, 'cann'),
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
          templateName: 'torch_library_template',
        });

        const projectDir = path.join(ctx.root, 'op_add');
        const settingsPath = path.join(projectDir, '.vscode', 'settings.json');
        const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8')) as Record<string, unknown>;

        deployTarget = settings['op-devtools.compileAndDeploy.buildConfig.deployCommandOrRunCommand'];
        projectTypeSetting = settings['op-devtools.projectType'];

        const cachePath = path.join(projectDir, '.vscode', 'cache.json');
        const cache = JSON.parse(fs.readFileSync(cachePath, 'utf8')) as {
          sanitizerPythonTarget?: Record<string, string>
        };

        cacheSanitizerTarget = cache.sanitizerPythonTarget?.['op_add'];

        // Re-point the mocked configuration API at the CREATED project's
        // settings.json so the runtime read-back and the real command chain
        // read the seeded values (the harness default mock watches the
        // workspace root only).
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const vscode = require('vscode') as { workspace: { getConfiguration: jest.Mock } };

        vscode.workspace.getConfiguration.mockReturnValue(liveSettingsConfig(settingsPath));

        const { ConfigService } = requireFresh<{
          ConfigService: {
            getBuildOpConfig: ()=> {
              targetFile: string | null
            }
          }
        }>('@plugin/service/config-service');

        runtimeTarget = ConfigService.getBuildOpConfig()
          .targetFile ?? undefined;

        const {
          resolveBuildOpBaseContext, resolveBuildExampleBaseContext, resolveSanitizerBaseContext, getRunCommand, getSanitizerCommand,
        } = requireFresh<{
          resolveBuildOpBaseContext: (projectPath: string, op: string, operatorNames?: string)=> unknown
          resolveBuildExampleBaseContext: (projectPath: string, op: string, operatorNames?: string)=> unknown
          resolveSanitizerBaseContext: (projectPath: string, op: string, operatorNames?: string)=> unknown
          getRunCommand: (baseContext: unknown)=> string
          getSanitizerCommand: (baseContext: unknown, exampleBaseContext: unknown)=> string
        }>('@plugin/domain');

        runCommand = getRunCommand(resolveBuildOpBaseContext(projectDir));
        sanitizerCommand = getSanitizerCommand(
          resolveSanitizerBaseContext(projectDir),
          resolveBuildExampleBaseContext(projectDir),
        );
      },
    });

    // The settings seed writes the torch target, NOT the generic build/<op>.
    expect(deployTarget)
      .toBe('python ../run.py');
    // Init persists the canonical creation type (viewIdToProjectType(1)).
    expect(projectTypeSetting)
      .toBe('cann');
    // The sanitizer python target seed for torch_library.
    expect(cacheSanitizerTarget)
      .toBe('python ../run.py');
    expect(runtimeTarget)
      .toBe('python ../run.py');
    // Real-chain parity with the golden torch_library etalon.
    expect(runCommand)
      .toBeDefined();
    expect(runCommand!.split('&&')
      .pop()
      ?.trim())
      .toBe('python ../run.py');
    expect(sanitizerCommand)
      .toBeDefined();
    expect(sanitizerCommand)
      .toContain('python ../run.py');
  });
});
