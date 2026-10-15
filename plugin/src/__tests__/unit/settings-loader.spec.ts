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

import {
  createMainConfigWatcher,
  type MainConfigWatchDeps,
} from '@plugin/helpers/main-config-watch';
import { getCacheFilePath } from '@plugin/helpers/workspace-cache';
import {
  getIdeConfigDir, getIdeSettingsFilePath,
} from '@plugin/helpers/ide-config-dir';
import { SettingsLoader } from '@plugin/service/settings-loader';
import {
  getFlavorDefault,
  isFlavorGated,
} from '@shared/flavor';

jest.mock('i18next', () => ({ t: (key: string) => key }));

jest.mock('@shared/flavor', () => ({
  ...jest.requireActual('@shared/flavor'),
  isFlavorGated: jest.fn(() => true),
  getFlavorDefault: jest.fn(() => false),
}));

const makeDeps = (): MainConfigWatchDeps => ({
  projectService: { syncAscendEnvScriptFromWorkspaceSettings: jest.fn() },
  operateTreeProvider: { notifyConfigurationChanged: jest.fn() },
  operatorProjectsTreeProvider: { notifyConfigurationChanged: jest.fn() },
  logDebug: jest.fn(),
  promptReloadWindow: jest.fn(),
});

const makeOperatorMetricsEvent = () => ({ affectsConfiguration: (key: string) => key === 'op-devtools.performanceTuning.onBoard.operatorMetrics' });

describe('SettingsLoader', () => {
  let tmpRoot: string;
  let settingsPath: string;
  const getStore: Record<string, unknown> = {};
  const inspectStore: Record<string, unknown> = {};

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'settings-loader-'));
    fs.mkdirSync(getIdeConfigDir(tmpRoot), { recursive: true });
    settingsPath = getIdeSettingsFilePath(tmpRoot);
    Object.keys(getStore)
      .forEach((key) => delete getStore[key]);
    Object.keys(inspectStore)
      .forEach((key) => delete inspectStore[key]);
    vscode.workspace.workspaceFolders = [{ uri: { fsPath: tmpRoot } } as vscode.WorkspaceFolder];
    (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue({
      inspect: jest.fn((key: string) => (
        key in inspectStore
          ? {
            workspaceFolderValue: undefined,
            workspaceValue: inspectStore[key],
            globalValue: undefined,
          }
          : undefined
      )),
      get: <T>(key: string, defaultValue?: T) => (getStore[key] as T) ?? defaultValue,
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

  it('read returns default when unset and value when set', () => {
    expect(SettingsLoader.read<boolean>('sanitizer.showQuickOptions', true))
      .toBe(true);

    getStore['sanitizer.showQuickOptions'] = false;
    expect(SettingsLoader.read<boolean>('sanitizer.showQuickOptions', true))
      .toBe(false);
  });

  it('readOptional returns undefined when unset', () => {
    expect(SettingsLoader.readOptional('sanitizer.memory'))
      .toBeUndefined();

    getStore['sanitizer.memory'] = 42;
    expect(SettingsLoader.readOptional('sanitizer.memory'))
      .toBe(42);
  });

  it('write delegates to the guarded settings persist (identical write is a no-op)', async () => {
    const wrote = await SettingsLoader.write({ 'sanitizer.memory': true }, tmpRoot);

    expect(wrote)
      .toBe(true);
    expect(fs.existsSync(settingsPath))
      .toBe(true);

    const afterFirst = fs.readFileSync(settingsPath, 'utf8');
    const firstMtime = fs.statSync(settingsPath).mtimeMs;

    const wroteAgain = await SettingsLoader.write({ 'sanitizer.memory': true }, tmpRoot);

    expect(wroteAgain)
      .toBe(false);
    expect(fs.readFileSync(settingsPath, 'utf8'))
      .toBe(afterFirst);
    expect(fs.statSync(settingsPath).mtimeMs)
      .toBe(firstMtime);

    const wroteChanged = await SettingsLoader.write({ 'sanitizer.memory': false }, tmpRoot);

    expect(wroteChanged)
      .toBe(true);

    const parsed = JSON.parse(fs.readFileSync(settingsPath, 'utf8')) as Record<string, unknown>;

    expect(parsed['op-devtools.sanitizer.memory'])
      .toBe(false);
  });

  it('clear removes op-devtools keys and keeps non-op-devtools', async () => {
    fs.writeFileSync(
      settingsPath,
      `${JSON.stringify({
        'editor.fontSize': 14,
        'op-devtools.sanitizer.memory': true,
        'op-devtools.debugMode': true,
      }, null, 2)}\n`,
      'utf8',
    );

    const cleared = await SettingsLoader.clear(tmpRoot);

    expect(cleared)
      .toBe(true);

    const parsed = JSON.parse(fs.readFileSync(settingsPath, 'utf8')) as Record<string, unknown>;

    expect(parsed['editor.fontSize'])
      .toBe(14);
    expect(parsed['op-devtools.sanitizer.memory'])
      .toBeUndefined();
    expect(parsed['op-devtools.debugMode'])
      .toBeUndefined();
  });

  it('updateCache creates cache.json from scratch', async () => {
    const cachePath = getCacheFilePath(tmpRoot);

    expect(fs.existsSync(cachePath))
      .toBe(false);

    const wrote = await SettingsLoader.updateCache(tmpRoot, (cache) => {
      cache.sanitizerPythonTarget = { myop: 'python3 run.py' };
    });

    expect(wrote)
      .toBe(true);
    expect(fs.existsSync(cachePath))
      .toBe(true);

    const parsed = JSON.parse(fs.readFileSync(cachePath, 'utf8')) as Record<string, unknown>;

    expect(parsed.schemaVersion)
      .toBe(1);
    expect(parsed.sanitizerPythonTarget)
      .toEqual({ myop: 'python3 run.py' });
  });

  it('updateCache merges per-field and never clobbers existing state', async () => {
    await SettingsLoader.updateCache(tmpRoot, (cache) => {
      cache.project = {
        selectedOperatorPaths: ['/a'],
        compiledOpPaths: { '/a': true },
      };
    });

    await SettingsLoader.updateCache(tmpRoot, (cache) => {
      cache.fileMapLists = {
        sanitizer: [],
        simulate: [],
        on_board: [],
      };
    });

    const parsed = JSON.parse(fs.readFileSync(getCacheFilePath(tmpRoot), 'utf8')) as Record<string, unknown>;

    expect(parsed.project)
      .toEqual({
        selectedOperatorPaths: ['/a'],
        compiledOpPaths: { '/a': true },
      });
    expect(parsed.fileMapLists)
      .toEqual({
        sanitizer: [],
        simulate: [],
        on_board: [],
      });
    expect(parsed.schemaVersion)
      .toBe(1);
  });

  it('createMainConfigWatcher wires the single onDidChangeConfiguration and skips the cascade on an empty settings file', async () => {
    getStore['performanceTuning.onBoard.operatorMetrics'] = true;

    const disposable = createMainConfigWatcher(makeDeps());

    expect(vscode.workspace.onDidChangeConfiguration)
      .toHaveBeenCalledTimes(1);
    expect(disposable)
      .toBeDefined();

    const handler = (vscode.workspace.onDidChangeConfiguration as jest.Mock).mock.calls[0][0] as (event: unknown)=> Promise<void>;

    await handler(makeOperatorMetricsEvent());

    expect(fs.existsSync(settingsPath))
      .toBe(false);
  });

  it('a global-only operatorMetrics value does not trigger the onBoard cascade (inspect-based read)', async () => {
    fs.writeFileSync(
      settingsPath,
      `${JSON.stringify({ 'editor.fontSize': 12 }, null, 2)}\n`,
      'utf8',
    );
    const before = fs.readFileSync(settingsPath, 'utf8');

    // Global store reports the value through `.get`, but the cascade reads via
    // the inspect-based read — an undeclared key reported only at global scope
    // is not visible there, so no workspace cascade write happens.
    getStore['performanceTuning.onBoard.operatorMetrics'] = true;
    expect(SettingsLoader.read<boolean>('performanceTuning.onBoard.operatorMetrics', false))
      .toBe(true);

    createMainConfigWatcher(makeDeps());
    const handler = (vscode.workspace.onDidChangeConfiguration as jest.Mock).mock.calls[0][0] as (event: unknown)=> Promise<void>;

    await handler(makeOperatorMetricsEvent());

    expect(fs.readFileSync(settingsPath, 'utf8'))
      .toBe(before);
  });

  it('write with no arguments resolves the workspace root and is a no-op without updates', async () => {
    const wrote = await SettingsLoader.write();

    expect(wrote)
      .toBe(false);
  });

  it('readCache returns the cache written by updateCache', async () => {
    await SettingsLoader.updateCache(tmpRoot, (cache) => {
      cache.sanitizerPythonTarget = { myop: 'python3 run.py' };
    });

    const cache = SettingsLoader.readCache(tmpRoot);

    expect(cache.schemaVersion)
      .toBe(1);
    expect(cache.sanitizerPythonTarget)
      .toEqual({ myop: 'python3 run.py' });
  });

  it('isOperatorSupportEnabled treats operator types without a toggle key as enabled', () => {
    expect(SettingsLoader.isOperatorSupportEnabled('cann'))
      .toBe(true);
    expect(SettingsLoader.isOperatorSupportEnabled(''))
      .toBe(true);
  });

  it('isOperatorSupportEnabled normalizes the operator type before the key lookup', () => {
    getStore['operatorSupport.triton'] = false;

    expect(SettingsLoader.isOperatorSupportEnabled('  Triton '))
      .toBe(false);
    expect(SettingsLoader.isOperatorSupportEnabled('TRITON'))
      .toBe(false);
  });

  it('isOperatorSupportEnabled honors the flavor gate and returns false when the gate is off', () => {
    (isFlavorGated as jest.Mock).mockReturnValueOnce(false);

    expect(SettingsLoader.isOperatorSupportEnabled('triton'))
      .toBe(false);
  });

  it('isOperatorSupportEnabled falls back to the flavor default when unset', () => {
    expect(SettingsLoader.isOperatorSupportEnabled('triton'))
      .toBe(false);
  });

  it('isOperatorSupportEnabled falls back to true when the flavor default is undefined', () => {
    (getFlavorDefault as jest.Mock).mockReturnValueOnce(undefined);

    expect(SettingsLoader.isOperatorSupportEnabled('triton'))
      .toBe(true);
  });

  it('isMsAgentAiFixEnabled returns the explicit setting or false when unset', () => {
    expect(SettingsLoader.isMsAgentAiFixEnabled())
      .toBe(false);

    getStore['sanitizer.enableMsAgentAiFix'] = true;
    expect(SettingsLoader.isMsAgentAiFixEnabled())
      .toBe(true);

    getStore['sanitizer.enableMsAgentAiFix'] = false;
    expect(SettingsLoader.isMsAgentAiFixEnabled())
      .toBe(false);
  });

  it('getCannbotPromptOverride returns undefined when unset, blank, or non-string', () => {
    expect(SettingsLoader.getCannbotPromptOverride())
      .toBeUndefined();

    getStore['profilingReport.cannbotPromptOverride'] = '   ';
    expect(SettingsLoader.getCannbotPromptOverride())
      .toBeUndefined();

    getStore['profilingReport.cannbotPromptOverride'] = 42;
    expect(SettingsLoader.getCannbotPromptOverride())
      .toBeUndefined();
  });

  it('getCannbotPromptOverride returns the trimmed override text when set', () => {
    getStore['profilingReport.cannbotPromptOverride'] = '  debug prompt  ';
    expect(SettingsLoader.getCannbotPromptOverride())
      .toBe('debug prompt');
  });
});
