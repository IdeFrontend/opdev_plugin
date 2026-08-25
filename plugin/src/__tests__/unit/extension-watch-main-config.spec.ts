import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import * as vscode from 'vscode';

import {
  createMainConfigHandler,
  type MainConfigWatchDeps,
} from '@plugin/helpers/main-config-watch';
import {
  getIdeConfigDir, getIdeSettingsFilePath,
} from '@plugin/helpers/ide-config-dir';
import { resetGuardedPersistChainForTest } from '@plugin/helpers/ide-settings-persist';
import { ConfigService } from '@plugin/service/config-service';
import { projectService } from '@plugin/service/project-service';

jest.mock('@plugin/service/project-service', () => ({ projectService: { syncAscendEnvScriptFromWorkspaceSettings: jest.fn(async () => {}) } }));

const ON_BOARD_OPERATOR_METRIC_CHILD_KEYS = [
  'performanceTuning.onBoard.cubeAndVectorInstructionTimeAndRatio',
  'performanceTuning.onBoard.l2CacheHitRate',
  'performanceTuning.onBoard.memoryReadWriteBandwidth',
  'performanceTuning.onBoard.l0ReadWriteBandwidth',
  'performanceTuning.onBoard.ubReadWriteBandwidth',
  'performanceTuning.onBoard.computeAndMoveUnitTimeRatio',
  'performanceTuning.onBoard.resourceConflictRatio',
] as const;

describe('watchMainConfig (extracted handler)', () => {
  let tmpRoot: string;
  let settingsPath: string;
  const getStore: Record<string, unknown> = {};

  const makeDeps = (): MainConfigWatchDeps => ({
    projectService,
    operateTreeProvider: { notifyConfigurationChanged: jest.fn() },
    operatorProjectsTreeProvider: { notifyConfigurationChanged: jest.fn() },
    logDebug: jest.fn(),
    promptReloadWindow: jest.fn(async () => {}),
  });

  const makeEvent = (affectedKeys: string[]) => ({ affectsConfiguration: jest.fn((key: string) => affectedKeys.includes(key)) });

  beforeEach(() => {
    resetGuardedPersistChainForTest();
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'watch-main-config-'));
    fs.mkdirSync(getIdeConfigDir(tmpRoot), { recursive: true });
    settingsPath = getIdeSettingsFilePath(tmpRoot);
    Object.keys(getStore)
      .forEach((k) => delete getStore[k]);
    vscode.workspace.workspaceFolders = [{ uri: { fsPath: tmpRoot } } as vscode.WorkspaceFolder];
    // The operatorMetrics cascade reads through the inspect-based
    // `ConfigService.readOpDevtoolsSetting` (settings-loader era), so the mock
    // exposes workspace-scope values via inspect instead of `.get`.
    (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue({
      inspect: jest.fn((key: string) => (
        key in getStore
          ? {
            workspaceFolderValue: undefined,
            workspaceValue: getStore[key],
            globalValue: undefined,
          }
          : undefined
      )),
      get: <T>(key: string) => getStore[key] as T | undefined,
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

  it('runs the operatorMetrics cascade exactly once per change and skips the echo event', async () => {
    await ConfigService.writeOpDevtoolsDottedSettings({ 'sanitizer.memory': true }, tmpRoot);
    getStore['performanceTuning.onBoard.operatorMetrics'] = true;

    const handler = createMainConfigHandler(makeDeps());

    await handler(makeEvent(['op-devtools.performanceTuning.onBoard.operatorMetrics']));

    const parsed = JSON.parse(fs.readFileSync(settingsPath, 'utf8')) as Record<string, unknown>;

    for (const key of ON_BOARD_OPERATOR_METRIC_CHILD_KEYS) {
      expect(parsed[`op-devtools.${key}`])
        .toBe(true);
    }

    // Echo event as fired by the fs write itself (onBoard root + op-devtools root).
    const beforeEcho = fs.readFileSync(settingsPath, 'utf8');

    await handler(makeEvent([
      'op-devtools.performanceTuning.onBoard',
      'op-devtools',
    ]));

    expect(fs.readFileSync(settingsPath, 'utf8'))
      .toBe(beforeEcho);
  });

  it('skips a byte-identical write (content-diff guard)', async () => {
    await ConfigService.writeOpDevtoolsDottedSettings({ 'sanitizer.memory': true }, tmpRoot);
    const before = fs.readFileSync(settingsPath, 'utf8');

    const wrote = await ConfigService.writeOpDevtoolsDottedSettings({ 'sanitizer.memory': true }, tmpRoot);

    expect(wrote)
      .toBe(false);
    expect(fs.readFileSync(settingsPath, 'utf8'))
      .toBe(before);
  });

  it('does not loop the environment branch when an environment write echoes', async () => {
    const syncMock = projectService.syncAscendEnvScriptFromWorkspaceSettings as jest.Mock;

    syncMock.mockImplementation(async () => {
      await ConfigService.writeOpDevtoolsDottedSettings({ 'environment.environmentScript': '/etc/profile' }, tmpRoot);
    });

    const handler = createMainConfigHandler(makeDeps());
    const envEvent = makeEvent(['op-devtools.environment']);

    // First event: sync echoes an environment.* write → real write happens.
    await handler(envEvent);
    const afterFirst = fs.readFileSync(settingsPath, 'utf8');

    expect(afterFirst)
      .toContain('"op-devtools.environment.environmentScript"');
    expect(syncMock)
      .toHaveBeenCalledTimes(1);

    // Echo event: sync runs again, but its write is byte-identical → no write, no file change.
    await handler(envEvent);

    expect(fs.readFileSync(settingsPath, 'utf8'))
      .toBe(afterFirst);
    expect(syncMock)
      .toHaveBeenCalledTimes(2);
  });

  it('does not run the onBoard cascade when settings.json is empty or missing', async () => {
    getStore['performanceTuning.onBoard.operatorMetrics'] = true;

    const handler = createMainConfigHandler(makeDeps());

    await handler(makeEvent(['op-devtools.performanceTuning.onBoard.operatorMetrics']));

    expect(fs.existsSync(settingsPath))
      .toBe(false);
  });
});
