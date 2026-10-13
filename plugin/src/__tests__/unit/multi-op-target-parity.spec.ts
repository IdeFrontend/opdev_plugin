/**
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 * This program is free software, you can redistribute it and/or modify it under the terms and conditions of
 * CANN Open Software License Agreement Version 2.0 (the "License").
 * Please refer to the License for details. You may not use this file except in compliance with the License.
 * THIS SOFTWARE IS PROVIDED ON AN "AS IS" BASIS, WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED,
 * INCLUDING BUT NOT LIMITED TO NON-INFRINGEMENT, MERCHANTABILITY, OR FITNESS FOR A PARTICULAR PURPOSE.
 * See LICENSE in the root of the software repository for the full text of the License.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import * as vscode from 'vscode';

import { ConfigService } from '@plugin/service/config-service';
import { getIdeSettingsFilePath } from '@plugin/helpers/ide-config-dir';
import { getCacheFilePath } from '@plugin/helpers/workspace-cache';
import { normalizeProjectPath } from '@plugin/domain/models/project-model';
import { registerOperatorPlugins } from '@plugin/domain/plugins';

describe('workspace target keys are seeded only for single-operator projects', () => {
  let tmpRoot: string;
  let settingsPath: string;

  beforeEach(() => {
    registerOperatorPlugins();
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'op-multi-op-'));
    settingsPath = getIdeSettingsFilePath(tmpRoot);
    (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue({
      inspect: jest.fn(() => undefined),
      get: jest.fn(),
      update: jest.fn(),
    });
    jest.clearAllMocks();
  });

  afterEach(() => {
    fs.rmSync(tmpRoot, {
      recursive: true,
      force: true,
    });
  });

  function readSettings(): Record<string, unknown> {
    if (!fs.existsSync(settingsPath)) {
      return {};
    }

    return JSON.parse(fs.readFileSync(settingsPath, 'utf8')) as Record<string, unknown>;
  }

  it('single-operator project (no scan state): seeds the root target keys', async () => {
    await ConfigService.ensureOpDevtoolsSettingsSeeded(tmpRoot, '', 'cann', tmpRoot);

    const parsed = readSettings();

    expect(parsed['op-devtools.compileAndDeploy.buildConfig.deployCommandOrRunCommand'])
      .toBe(path.join(tmpRoot, 'build', path.basename(tmpRoot)));
    expect(parsed['op-devtools.compileAndDeploy.exampleBuildConfig.targetFile'])
      .toBe(path.join(tmpRoot, 'build', path.basename(tmpRoot)));
  });

  it('multi-operator workspace (scan opsList > 1): target keys still seed with the ROOT paths', async () => {
    // The collection scan state a standard-custom open/creation produces.
    const cachePath = getCacheFilePath(tmpRoot);

    fs.mkdirSync(path.dirname(cachePath), { recursive: true });
    fs.writeFileSync(
      cachePath,
      `${JSON.stringify({
        schemaVersion: 1,
        folders: {
          [normalizeProjectPath(tmpRoot)]: {
            opsMeet: [],
            opsList: [
              {
                name: 'add',
                path: path.join(tmpRoot, 'math', 'add'),
              },
              {
                name: 'sub',
                path: path.join(tmpRoot, 'math', 'sub'),
              },
            ],
            experimentalOpsList: [],
          },
        },
      }, null, 2)}\n`,
      'utf8',
    );

    await ConfigService.ensureOpDevtoolsSettingsSeeded(tmpRoot, '', 'cann', tmpRoot);

    const parsed = readSettings();

    // Root-keyed model: a standard-custom collection builds through ONE root
    // operator, so the workspace-level target keys carry the ROOT build paths
    // even with a multi-operator scan state.
    expect(parsed['op-devtools.compileAndDeploy.buildConfig.deployCommandOrRunCommand'])
      .toBe(path.join(tmpRoot, 'build', path.basename(tmpRoot)));
    expect(parsed['op-devtools.compileAndDeploy.exampleBuildConfig.targetFile'])
      .toBe(path.join(tmpRoot, 'build', path.basename(tmpRoot)));
    // Other sections are seeded as before (per-config_type create-if-missing).
    expect(parsed['op-devtools.compileAndDeploy.buildConfig.compileCommand'])
      .toBe(`bash ${path.join(tmpRoot, 'build.sh')}`);
  });
});
