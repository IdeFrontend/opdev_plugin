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
      race: false,
      uninitialized: true,
      soc: true,
      over: false,
      memoryLeak: true,
    });

    const parsed = readSettings();

    expect(parsed['op-devtools.sanitizer.toolType'])
      .toBe('npu-check');
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

  it('setSanitizerShowQuickOptions writes settings.json (settings-only runtime, no DB)', async () => {
    await commonMethods.setSanitizerShowQuickOptions({ value: false });

    const parsed = readSettings();

    expect(parsed['op-devtools.sanitizer.showQuickOptions'])
      .toBe(false);
  });
});
