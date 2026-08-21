import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import * as vscode from 'vscode';
import {
  SETTINGS_MIGRATED_FROM_LEGACY_KEY, configService,
} from '@plugin/service/config-service';
import { commonMethods } from '@plugin/controller/common-controller';

jest.mock('@plugin/core/project/project-manager', () => ({ ProjectManager: { getInstance: jest.fn() } }));

jest.mock('@plugin/domain/services/configuration', () => ({
  getConfig: jest.fn(),
  postConfig: jest.fn(),
  getConfigById: jest.fn(),
}));

import {
  getIdeConfigDir, getIdeSettingsFilePath,
} from '@plugin/helpers/ide-config-dir';
import { postConfig } from '@plugin/domain/services/configuration';
import { ProjectManager } from '@plugin/core/project/project-manager';

describe('webview/API settings writes (no legacy DB)', () => {
  let tmpRoot: string;
  let settingsPath: string;
  const getStore: Record<string, unknown> = {};

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'op-devtools-webview-'));
    fs.mkdirSync(getIdeConfigDir(tmpRoot), { recursive: true });
    settingsPath = getIdeSettingsFilePath(tmpRoot);
    Object.keys(getStore)
      .forEach((k) => delete getStore[k]);
    getStore[SETTINGS_MIGRATED_FROM_LEGACY_KEY] = true;

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

  it('saveSanitizerForm writes settings.json and never calls postConfig', async () => {
    await configService.saveSanitizerForm({
      data: {
        toolType: 'npu-sanitizer',
        tool: {
          memcheck: true,
          synccheck: false,
          racecheck: false,
          initcheck: true,
          soccheck: true,
          overcheck: false,
        },
        memcheckOption: {
          'leak-check': true,
          'check-unused-memory': false,
        },
      },
    });

    expect(postConfig).not.toHaveBeenCalled();
    const parsed = readSettings();

    expect(parsed['op-devtools.sanitizer.toolType'])
      .toBe('npu-sanitizer');
    expect(parsed['op-devtools.sanitizer.memory'])
      .toBe(true);
    expect(parsed['op-devtools.sanitizer.sync'])
      .toBe(false);
    expect(parsed['op-devtools.sanitizer.race'])
      .toBe(false);
    expect(parsed['op-devtools.sanitizer.soc'])
      .toBe(true);
    expect(parsed['op-devtools.sanitizer.over'])
      .toBe(false);
    expect(parsed['op-devtools.sanitizer.memoryLeak'])
      .toBe(true);
  });

  it('saveConfig (simulate) writes settings.json and never calls postConfig', async () => {
    await configService.saveConfig({
      type: 'simulate',
      data: [
        {
          user_options: {
            PMSampling: false,
            ResourceConflictRatio: true,
          },
        },
      ],
    });

    expect(postConfig).not.toHaveBeenCalled();
    const parsed = readSettings();

    expect(parsed['op-devtools.performanceTuning.simulation.memoryThroughputWaveform'])
      .toBe(false);
    expect(parsed['op-devtools.performanceTuning.simulation.resourceConflictRatio'])
      .toBe(true);
  });

  it('saveConfig (on_board) writes settings.json and never calls postConfig', async () => {
    await configService.saveConfig({
      type: 'on_board',
      data: [
        {
          user_options: {
            Occupancy: true,
            Roofline: false,
            Source: true,
          },
        },
      ],
    });

    expect(postConfig).not.toHaveBeenCalled();
    const parsed = readSettings();

    expect(parsed['op-devtools.performanceTuning.onBoard.interCoreLoad'])
      .toBe(true);
    expect(parsed['op-devtools.performanceTuning.onBoard.roofline'])
      .toBe(false);
  });

  it('saveConfig (on_board) writes operatorMetrics when parent checkbox is toggled', async () => {
    await configService.saveConfig({
      type: 'on_board',
      data: [
        {
          user_options: {
            operatorMetrics: false,
            ArithmeticUtilization: false,
            L2Cache: false,
          },
        },
      ],
    });

    expect(readSettings()['op-devtools.performanceTuning.onBoard.operatorMetrics'])
      .toBe(false);
  });

  it('setSanitizerShowQuickOptions writes settings.json and never calls postConfig', async () => {
    await commonMethods.setSanitizerShowQuickOptions({ value: false });

    expect(postConfig).not.toHaveBeenCalled();
    const parsed = readSettings();

    expect(parsed['op-devtools.sanitizer.showQuickOptions'])
      .toBe(false);
  });
});
