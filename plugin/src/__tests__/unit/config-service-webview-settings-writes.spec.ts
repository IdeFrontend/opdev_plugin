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
import { commonMethods } from '@plugin/controller/common-controller';

jest.mock('@plugin/core/project/project-manager', () => ({ ProjectManager: { getInstance: jest.fn() } }));

import {
  getIdeConfigDir, getIdeSettingsFilePath,
} from '@plugin/helpers/ide-config-dir';
import { configMethods } from '@plugin/controller/config-controller';
import { ProjectManager } from '@plugin/core/project/project-manager';

describe('webview/API settings writes (no DB)', () => {
  let tmpRoot: string;
  let settingsPath: string;
  const getStore: Record<string, unknown> = {};

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'op-devtools-webview-'));
    fs.mkdirSync(getIdeConfigDir(tmpRoot), { recursive: true });
    settingsPath = getIdeSettingsFilePath(tmpRoot);
    Object.keys(getStore)
      .forEach((k) => delete getStore[k]);

    (ProjectManager.getInstance as jest.Mock).mockReturnValue({
      projectId: '1',
      getProjectInfo: () => ({ path: tmpRoot }),
    });
    vscode.workspace.workspaceFolders = [{ uri: { fsPath: tmpRoot } } as vscode.WorkspaceFolder];
    (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue({
      inspect: jest.fn(),
      get: <T>(key: string, defaultValue?: T) => {
        const value = getStore[key] as T | undefined;

        return value !== undefined ? value : defaultValue;
      },
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

  it('saveSanitizerOptions persists the npu-check toolType and npu check options', async () => {
    await configMethods.saveSanitizerOptions({
      toolType: 'npu-check',
      memory: true,
      sync: false,
      raceCheck: true,
      initCheck: false,
      race: false,
      uninitialized: true,
      memoryLeak: true,
    });

    const parsed = readSettings();

    expect(parsed['op-devtools.sanitizer.toolType'])
      .toBe('npu-check');
    expect(parsed['op-devtools.sanitizer.memory'])
      .toBe(true);
    expect(parsed['op-devtools.sanitizer.sync'])
      .toBe(false);
    expect(parsed['op-devtools.sanitizer.raceCheck'])
      .toBe(true);
    expect(parsed['op-devtools.sanitizer.initCheck'])
      .toBe(false);
    expect(parsed['op-devtools.sanitizer.race'])
      .toBe(false);
    expect(parsed['op-devtools.sanitizer.memoryLeak'])
      .toBe(true);
  });

  it('setSanitizerShowQuickOptions writes settings.json (settings-only runtime, no DB)', async () => {
    await commonMethods.setSanitizerShowQuickOptions({ value: false });

    const parsed = readSettings();

    expect(parsed['op-devtools.sanitizer.showQuickOptions'])
      .toBe(false);
  });
});
