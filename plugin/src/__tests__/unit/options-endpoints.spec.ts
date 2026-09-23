import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import * as vscode from 'vscode';
import { configMethods } from '@plugin/controller/config-controller';
import { ConfigService } from '@plugin/service/config-service';
import {
  createMainConfigHandler,
  type MainConfigWatchDeps,
} from '@plugin/helpers/main-config-watch';
import {
  getIdeConfigDir, getIdeSettingsFilePath,
} from '@plugin/helpers/ide-config-dir';
import { resetGuardedPersistChainForTest } from '@plugin/helpers/ide-settings-persist';
import { projectService } from '@plugin/service/project-service';
import type {
  OnBoardOptions,
  SanitizerOptions,
  SimulateOptions,
} from '@shared/api-types';

jest.mock('@plugin/core/project/project-manager', () => ({ ProjectManager: { getInstance: jest.fn() } }));
jest.mock('@plugin/service/project-service', () => ({ projectService: { syncAscendEnvScriptFromWorkspaceSettings: jest.fn(async () => {}) } }));

jest.mock('@plugin/domain/utils/ascend-util', () => ({
  ...jest.requireActual('@plugin/domain/utils/ascend-util'),
  resolveEffectiveCannSoc: jest.fn(() => 'ascend910b'),
}));

import { ProjectManager } from '@plugin/core/project/project-manager';

/** The 13 flat on-board option keys (dotted settings under `performanceTuning.onBoard.*`). */
const ON_BOARD_KEYS = [
  'interCoreLoad',
  'roofline',
  'operatorCodeHotspot',
  'cacheHeatmap',
  'pcSampling',
  'cubeAndVectorInstructionTimeAndRatio',
  'l2CacheHitRate',
  'memoryReadWriteBandwidth',
  'l0ReadWriteBandwidth',
  'ubReadWriteBandwidth',
  'computeAndMoveUnitTimeRatio',
  'resourceConflictRatio',
  'operatorMetrics',
] as const;

/** Child metrics synced by the `operatorMetrics` cascade (main-config-watch, not the endpoint). */
const ON_BOARD_OPERATOR_METRIC_CHILD_KEYS = [
  'cubeAndVectorInstructionTimeAndRatio',
  'l2CacheHitRate',
  'memoryReadWriteBandwidth',
  'l0ReadWriteBandwidth',
  'ubReadWriteBandwidth',
  'computeAndMoveUnitTimeRatio',
  'resourceConflictRatio',
] as const;

const ON_BOARD_VALUES: Record<(typeof ON_BOARD_KEYS)[number], boolean> = {
  interCoreLoad: true,
  roofline: false,
  operatorCodeHotspot: true,
  cacheHeatmap: false,
  pcSampling: true,
  cubeAndVectorInstructionTimeAndRatio: true,
  l2CacheHitRate: false,
  memoryReadWriteBandwidth: true,
  l0ReadWriteBandwidth: false,
  ubReadWriteBandwidth: true,
  computeAndMoveUnitTimeRatio: false,
  resourceConflictRatio: true,
  operatorMetrics: false,
};

describe('configMethods settings-native options endpoints', () => {
  let tmpRoot: string;
  let settingsPath: string;
  const inspectOverrides: Record<string, vscode.ConfigurationInspect<unknown> | undefined> = {};

  beforeEach(() => {
    resetGuardedPersistChainForTest();
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'op-devtools-options-'));
    fs.mkdirSync(getIdeConfigDir(tmpRoot), { recursive: true });
    settingsPath = getIdeSettingsFilePath(tmpRoot);
    Object.keys(inspectOverrides)
      .forEach((k) => delete inspectOverrides[k]);
    (ProjectManager.getInstance as jest.Mock).mockReturnValue({
      projectId: '1',
      getProjectInfo: () => ({ path: tmpRoot }),
    });
    vscode.workspace.workspaceFolders = [{ uri: { fsPath: tmpRoot } } as vscode.WorkspaceFolder];
    (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue({
      inspect: <T>(key: string) => {
        if (key in inspectOverrides) {
          return inspectOverrides[key] as vscode.ConfigurationInspect<T> | undefined;
        }

        const raw = readSettings();
        const fullKey = `op-devtools.${key}`;

        return fullKey in raw
          ? {
            key,
            workspaceFolderValue: raw[fullKey] as T,
          }
          : undefined;
      },
      get: <T>(key: string, defaultValue?: T) => {
        const raw = readSettings();
        const value = raw[`op-devtools.${key}`] as T | undefined;

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

  const makeDeps = (): MainConfigWatchDeps => ({
    projectService,
    operateTreeProvider: { notifyConfigurationChanged: jest.fn() },
    operatorProjectsTreeProvider: { notifyConfigurationChanged: jest.fn() },
    logDebug: jest.fn(),
    promptReloadWindow: jest.fn(async () => {}),
  });

  const makeEvent = (affectedKeys: string[]) => ({ affectsConfiguration: jest.fn((key: string) => affectedKeys.includes(key)) });

  it('getOnBoardOptions returns all 13 keys', async () => {
    await ConfigService.writeOpDevtoolsDottedSettings(
      Object.fromEntries(ON_BOARD_KEYS.map((key) => [
        `performanceTuning.onBoard.${key}`,
        ON_BOARD_VALUES[key],
      ])),
      tmpRoot,
    );

    expect(await configMethods.getOnBoardOptions())
      .toEqual({ ...ON_BOARD_VALUES });
  });

  it('getOnBoardOptions surfaces only explicitly set keys', async () => {
    expect(await configMethods.getOnBoardOptions())
      .toEqual({});
  });

  it('saveOnBoardOptions persists the surfaced keys — the SOC-hidden key is never written (non-A5: no pcSampling)', async () => {
    await configMethods.saveOnBoardOptions({ ...ON_BOARD_VALUES });

    const parsed = readSettings();

    for (const key of ON_BOARD_KEYS) {
      if (key === 'pcSampling') {
        // Hidden on non-A5 — the save must NOT clobber the A5 value.
        expect(parsed['op-devtools.performanceTuning.onBoard.pcSampling'])
          .toBeUndefined();

        continue;
      }

      expect(parsed[`op-devtools.performanceTuning.onBoard.${key}`])
        .toBe(ON_BOARD_VALUES[key]);
    }

    // No nested `"op-devtools": { user_options: ... }` wrapper.
    expect(parsed['op-devtools'])
      .toBeUndefined();
    // Old saveConfig always wrote `parameters: {}`; the new endpoint does not.
    expect(parsed['op-devtools.performanceTuning.onBoard.parameters'])
      .toBeUndefined();
  });

  it('on an A5 profiler the save drops the hidden cacheHeatmap key instead', async () => {
    const { resolveEffectiveCannSoc } = jest.requireMock('@plugin/domain/utils/ascend-util') as {
      resolveEffectiveCannSoc: jest.Mock
    };

    resolveEffectiveCannSoc.mockReturnValue('ascend950');

    await configMethods.saveOnBoardOptions({
      cacheHeatmap: true,
      pcSampling: true,
      roofline: false,
    });

    const parsed = readSettings();

    expect(parsed['op-devtools.performanceTuning.onBoard.pcSampling'])
      .toBe(true);
    expect(parsed['op-devtools.performanceTuning.onBoard.cacheHeatmap'])
      .toBeUndefined();
    expect(parsed['op-devtools.performanceTuning.onBoard.roofline'])
      .toBe(false);
  });

  it('saveOnBoardOptions ignores undefined fields (no key deletion)', async () => {
    await ConfigService.writeOpDevtoolsDottedSettings({ 'performanceTuning.onBoard.pcSampling': true }, tmpRoot);

    await configMethods.saveOnBoardOptions({
      pcSampling: undefined,
      roofline: false,
    });

    const parsed = readSettings();

    expect(parsed['op-devtools.performanceTuning.onBoard.pcSampling'])
      .toBe(true);
    expect(parsed['op-devtools.performanceTuning.onBoard.roofline'])
      .toBe(false);
  });

  it('saveOnBoardOptions writes operatorMetrics together with its child metrics', async () => {
    const payload: OnBoardOptions = {
      operatorMetrics: true,
      cubeAndVectorInstructionTimeAndRatio: true,
      l2CacheHitRate: true,
      memoryReadWriteBandwidth: true,
      l0ReadWriteBandwidth: true,
      ubReadWriteBandwidth: true,
      computeAndMoveUnitTimeRatio: true,
      resourceConflictRatio: true,
    };

    await configMethods.saveOnBoardOptions(payload);

    const parsed = readSettings();

    expect(parsed['op-devtools.performanceTuning.onBoard.operatorMetrics'])
      .toBe(true);

    for (const child of ON_BOARD_OPERATOR_METRIC_CHILD_KEYS) {
      expect(parsed[`op-devtools.performanceTuning.onBoard.${child}`])
        .toBe(true);
    }
  });

  it('saveOnBoardOptions does not duplicate the operatorMetrics cascade (watcher-owned)', async () => {
    await ConfigService.writeOpDevtoolsDottedSettings({
      'performanceTuning.onBoard.operatorMetrics': true,
      'performanceTuning.onBoard.cubeAndVectorInstructionTimeAndRatio': true,
    }, tmpRoot);

    // Toggling the parent via the endpoint leaves children untouched — the
    // main-config-watch handler is the single cascade owner.
    await configMethods.saveOnBoardOptions({ operatorMetrics: false });

    const parsed = readSettings();

    expect(parsed['op-devtools.performanceTuning.onBoard.operatorMetrics'])
      .toBe(false);
    expect(parsed['op-devtools.performanceTuning.onBoard.cubeAndVectorInstructionTimeAndRatio'])
      .toBe(true);
  });

  it('operatorMetrics cascade syncs child keys via createMainConfigHandler', async () => {
    await ConfigService.writeOpDevtoolsDottedSettings({ 'performanceTuning.onBoard.operatorMetrics': false }, tmpRoot);

    const handler = createMainConfigHandler(makeDeps());

    await handler(makeEvent(['op-devtools.performanceTuning.onBoard.operatorMetrics']));

    const parsed = readSettings();

    for (const child of ON_BOARD_OPERATOR_METRIC_CHILD_KEYS) {
      expect(parsed[`op-devtools.performanceTuning.onBoard.${child}`])
        .toBe(false);
    }
  });

  it('getOnBoardOptions does not surface global/user values when the workspace scope is empty', async () => {
    inspectOverrides['performanceTuning.onBoard.roofline'] = {
      key: 'performanceTuning.onBoard.roofline',
      globalValue: true,
      workspaceValue: undefined,
      workspaceFolderValue: undefined,
    };

    // The workspace-scoped read must not fall back to user scope — an unset
    // workspace key is simply absent.
    expect((await configMethods.getOnBoardOptions()).roofline)
      .toBeUndefined();
  });

  it('workspace-scope value wins over global when both are set', async () => {
    inspectOverrides['performanceTuning.onBoard.roofline'] = {
      key: 'performanceTuning.onBoard.roofline',
      globalValue: true,
      workspaceValue: false,
      workspaceFolderValue: undefined,
    };

    expect((await configMethods.getOnBoardOptions()).roofline)
      .toBe(false);
  });

  it('simulate pair round-trips the two dotted keys', async () => {
    const payload: SimulateOptions = {
      memoryThroughputWaveform: true,
      resourceConflictRatio: false,
    };

    await configMethods.saveSimulateOptions(payload);

    expect(readSettings()['op-devtools.performanceTuning.simulation.memoryThroughputWaveform'])
      .toBe(true);
    expect(readSettings()['op-devtools.performanceTuning.simulation.resourceConflictRatio'])
      .toBe(false);
    expect(await configMethods.getSimulateOptions())
      .toEqual(payload);
  });

  it('saveSimulateOptions({}) is a no-op and deletes nothing', async () => {
    await ConfigService.writeOpDevtoolsDottedSettings({ 'performanceTuning.simulation.memoryThroughputWaveform': true }, tmpRoot);

    await configMethods.saveSimulateOptions({});

    expect(readSettings()['op-devtools.performanceTuning.simulation.memoryThroughputWaveform'])
      .toBe(true);
  });

  it('sanitizer singleBlock round-trips detectionScope and blockId', async () => {
    const payload: SanitizerOptions = {
      detectionScope: 'singleBlock',
      blockId: 5,
      memory: true,
    };

    await configMethods.saveSanitizerOptions(payload);

    const parsed = readSettings();

    expect(parsed['op-devtools.sanitizer.detectionScope'])
      .toBe('singleBlock');
    expect(parsed['op-devtools.sanitizer.blockId'])
      .toBe(5);
    expect(parsed['op-devtools.sanitizer.memory'])
      .toBe(true);
    expect(await configMethods.getSanitizerOptions())
      .toEqual(payload);
  });

  it('sanitizer global scope persists blockId as null', async () => {
    await configMethods.saveSanitizerOptions({
      detectionScope: 'global',
      blockId: null,
    });

    const parsed = readSettings();

    expect(parsed['op-devtools.sanitizer.detectionScope'])
      .toBe('global');
    expect(parsed['op-devtools.sanitizer.blockId'])
      .toBeNull();
  });

  it('sanitizer global scope without blockId leaves an existing blockId untouched', async () => {
    await ConfigService.writeOpDevtoolsDottedSettings({ 'sanitizer.blockId': 7 }, tmpRoot);

    await configMethods.saveSanitizerOptions({ detectionScope: 'global' });

    expect(readSettings()['op-devtools.sanitizer.blockId'])
      .toBe(7);
  });

  it('saveNpuComputeSections writes all 8 booleans (true/false), getNpuComputeSections reads them back', async () => {
    await configMethods.saveNpuComputeSections([
      'Pipeline',
      'Memory',
    ]);

    const parsed = readSettings();

    expect(parsed['op-devtools.performanceTuning.onBoard.npuCompute.pipeline'])
      .toBe(true);
    expect(parsed['op-devtools.performanceTuning.onBoard.npuCompute.memory'])
      .toBe(true);
    expect(parsed['op-devtools.performanceTuning.onBoard.npuCompute.pipeUtilization'])
      .toBe(false);
    expect(parsed['op-devtools.performanceTuning.onBoard.npuCompute.resourceConflictRatio'])
      .toBe(false);

    expect(await configMethods.getNpuComputeSections())
      .toEqual([
        'Pipeline',
        'Memory',
      ]);
  });

  it('getNpuComputeSections returns [] when nothing is set', async () => {
    expect(await configMethods.getNpuComputeSections())
      .toEqual([]);
  });

  it('saveNpuComputeSections([]) clears all 8 booleans', async () => {
    await ConfigService.writeOpDevtoolsDottedSettings({
      'performanceTuning.onBoard.npuCompute.pipeline': true,
      'performanceTuning.onBoard.npuCompute.memory': true,
    }, tmpRoot);

    await configMethods.saveNpuComputeSections([]);

    const parsed = readSettings();

    expect(parsed['op-devtools.performanceTuning.onBoard.npuCompute.pipeline'])
      .toBe(false);
    expect(parsed['op-devtools.performanceTuning.onBoard.npuCompute.memory'])
      .toBe(false);
    expect(await configMethods.getNpuComputeSections())
      .toEqual([]);
  });
});
