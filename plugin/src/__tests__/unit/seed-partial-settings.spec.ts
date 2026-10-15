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
import { registerOperatorPlugins } from '@plugin/domain/plugins';

describe('settings seed is per-key create-if-missing (no one-key-skip-all)', () => {
  let tmpRoot: string;
  let settingsPath: string;

  beforeEach(() => {
    registerOperatorPlugins();
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'op-seed-partial-'));
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

  it('scopes the configuration inspection to the folder being seeded (multi-root parity)', async () => {
    await ConfigService.ensureOpDevtoolsSettingsSeeded(tmpRoot, '', 'cann', tmpRoot);

    const getConfiguration = vscode.workspace.getConfiguration as jest.Mock;

    // The filter must inspect THIS folder's configuration layer — the ambient
    // configuration would resolve to workspaceFolders[0] and drop folder 1's
    // keys for every other folder of a multi-root workspace.
    const scopedToFolder = getConfiguration.mock.calls.some((args: unknown[]) => {
      const scope = args[1] as { fsPath?: string } | undefined;

      return scope !== undefined && scope.fsPath === tmpRoot;
    });

    expect(scopedToFolder)
      .toBe(true);
  });

  it('a single pre-filled key must NOT skip the whole seed set (all other sections are filled)', async () => {
    fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
    fs.writeFileSync(
      settingsPath,
      `${JSON.stringify({ 'op-devtools.compileAndDeploy.buildConfig.compileCommand': 'user-prefilled' }, null, 2)}\n`,
      'utf8',
    );

    await ConfigService.ensureOpDevtoolsSettingsSeeded(tmpRoot, '', 'cann', tmpRoot);

    const parsed = readSettings();

    // The user's key is preserved...
    expect(parsed['op-devtools.compileAndDeploy.buildConfig.compileCommand'])
      .toBe('user-prefilled');
    // ...and every other section is still seeded (the old gate returned early
    // on the presence of that single key, dropping the whole set).
    expect(parsed['op-devtools.compileAndDeploy.buildConfig.deployCommandOrRunCommand'])
      .toBe(path.join(tmpRoot, 'build', path.basename(tmpRoot)));
    expect(parsed['op-devtools.compileAndDeploy.buildConfig.onBoardCompileCommand'])
      .toBe(`bash ${path.join(tmpRoot, 'build.sh')} --onboard`);
    expect(parsed['op-devtools.compileAndDeploy.buildConfig.simulationCompileCommand'])
      .toBe(`bash ${path.join(tmpRoot, 'build.sh')} --simulator`);
    expect(parsed['op-devtools.compileAndDeploy.buildConfig.sanitizerCompileCommand'])
      .toBe(`bash ${path.join(tmpRoot, 'build.sh')} --mssanitizer`);
    expect(parsed['op-devtools.compileAndDeploy.exampleBuildConfig.runCommand'])
      .toBe(`bash ${path.join(tmpRoot, 'build.sh')}`);
    expect(parsed['op-devtools.performanceTuning.onBoard.showQuickOptions'])
      .toBe(true);
    expect(parsed['op-devtools.performanceTuning.simulation.showQuickOptions'])
      .toBe(true);
    expect(parsed['op-devtools.sanitizer.showQuickOptions'])
      .toBe(true);
  });

  it('a second run is a no-op (the seed is idempotent per key)', async () => {
    await ConfigService.ensureOpDevtoolsSettingsSeeded(tmpRoot, '', 'cann', tmpRoot);
    const before = readSettings();

    await ConfigService.ensureOpDevtoolsSettingsSeeded(tmpRoot, '', 'cann', tmpRoot);

    expect(readSettings())
      .toEqual(before);
  });
});
