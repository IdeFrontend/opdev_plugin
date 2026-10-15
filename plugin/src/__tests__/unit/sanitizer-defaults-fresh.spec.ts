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
import { TritonCommandStrategy } from '@plugin/domain/services/command-strategy/triton-strategy';
import { getIdeSettingsFilePath } from '@plugin/helpers/ide-config-dir';
import { sanitizerService } from '@plugin/service/sanitizer-service';
import { ProjectManager } from '@plugin/core/project/project-manager';

jest.mock('i18next', () => ({ t: jest.fn((key: string) => key) }));

jest.mock('@plugin/domain/models/project-model', () => ({
  getProjectByPath: jest.fn(() => ({
    id: 0,
    project_name: 'cann_hello',
    project_path: '/repo/cann_hello',
    project_type: 'cann',
  })),
}));

jest.mock('@plugin/domain/plugins/operator-plugin.registry', () => ({
  OperatorPluginRegistry: {
    getOpPlugin: jest.fn(() => ({
      opType: 'cann',
      buildBehavior: {},
    })),
  },
}));

describe('sanitizer defaults on fresh projects', () => {
  let tmpRoot: string;

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'op-san-def-'));
    vscode.workspace.workspaceFolders = [{ uri: { fsPath: tmpRoot } } as vscode.WorkspaceFolder];
    (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue({
      inspect: jest.fn(() => undefined),
      get: jest.fn(),
    });
    // No cached project context — the REAL ProjectManager getter must
    // resolve projectPath from workspaceFolders[0] (fresh-window state). The
    // previous mock ({ projectPath: '/repo/cann_hello' }) masked the missing
    // workspace fallback that broke "Start now" on freshly created projects.
    ProjectManager.getInstance()
      .resetCachedProject();
    jest.clearAllMocks();
  });

  afterEach(() => {
    fs.rmSync(tmpRoot, {
      recursive: true,
      force: true,
    });
  });

  it('returns base defaults when no sanitizer.* settings exist (fresh project)', () => {
    const config = ConfigService.getSanitizerConfig(tmpRoot);

    expect(config.tool.memcheck)
      .toBe(true);
    expect(config.tool.racecheck)
      .toBe(true);
    expect(config.tool.initcheck)
      .toBe(true);
    expect(config.memcheckOption['leak-check'])
      .toBe(true);
    expect(config.memcheckOption['check-unused-memory'])
      .toBe(true);
    expect(config.logLevel)
      .toBe('warn');
    expect(config.maxDebuglogSize)
      .toBe(1024);
    expect(config.useBlock)
      .toBe(false);
    expect(config.blockId)
      .toBeNull();
  });

  it('does not merge defaults once any sanitizer setting exists', () => {
    const settingsPath = getIdeSettingsFilePath(tmpRoot);

    fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
    fs.writeFileSync(settingsPath, JSON.stringify({ 'op-devtools.sanitizer.memory': false }));
    (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue({
      inspect: jest.fn((key: string) => ({ workspaceValue: key === 'sanitizer.memory' ? false : undefined })),
      get: jest.fn(),
    });

    const config = ConfigService.getSanitizerConfig(tmpRoot);

    // The setting wins over the default seed (no full defaults merge).
    expect(config.tool?.memcheck)
      .toBe(false);
    // Partial settings carry ONLY the defined fields — the unset logLevel
    // stays ABSENT (the strategy omits the flag via normalizeLogLevel(undefined)).
    expect(config.logLevel)
      .toBeUndefined();
    expect(config.maxDebuglogSize)
      .toBeUndefined();
    expect(config.useBlock)
      .toBeUndefined();
    expect(config.blockId)
      .toBeUndefined();
    expect(config.tool?.racecheck)
      .toBeUndefined();
    expect(config.memcheckOption?.['leak-check'])
      .toBeUndefined();
  });

  it('partial settings (memory only) emit no default-derived flags in the sanitizer command', () => {
    const settingsPath = getIdeSettingsFilePath(tmpRoot);

    fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
    fs.writeFileSync(settingsPath, JSON.stringify({ 'op-devtools.sanitizer.memory': true }));
    (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue({
      inspect: jest.fn((key: string) => ({ workspaceValue: key === 'sanitizer.memory' ? true : undefined })),
      get: jest.fn(),
    });

    const config = ConfigService.getSanitizerConfig(tmpRoot);

    expect(config.tool?.memcheck)
      .toBe(true);
    expect(config.logLevel)
      .toBeUndefined();
    expect(config.maxDebuglogSize)
      .toBeUndefined();

    // Flags are emitted ONLY for defined user_options — the normalize* guards
    // return undefined and the option is omitted. A partial config must not
    // resurrect default --log-level / --max-debuglog-size / --block-id flags.
    const strategy = new TritonCommandStrategy();
    const command = strategy.buildSanitizerCommand({
      config,
      project: null,
      operator: null,
      sourceCannCmd: '',
      cdCmd: 'cd /op',
      cdBuildCmd: 'cd /op',
      op: 'add',
    }, 'python3 ./add.py');

    expect(command)
      .toContain('--tool=memcheck');
    expect(command)
      .not.toContain('--log-level=');
    expect(command)
      .not.toContain('--max-debuglog-size=');
    expect(command)
      .not.toContain('--block-id=');
    expect(command)
      .not.toContain('--leak-check=');
  });

  it('runSanitizer never reports "No sanitizer config" on a fresh project', async () => {
    const error = jest.fn();

    (vscode.window.showErrorMessage as jest.Mock).mockImplementation(error);
    await sanitizerService.runSanitizer({});

    const noConfigCall = error.mock.calls.find((call: unknown[]) => String(call[0])
      .includes('No sanitizer config'));

    expect(noConfigCall)
      .toBeUndefined();
  });
});
