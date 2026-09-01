import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import * as vscode from 'vscode';

const mockStorageGet = jest.fn(() => [] as string[]);
const mockStorageSet = jest.fn();
const mockGetConfig = jest.fn();
const mockProject = { projectPath: '' };

jest.mock('@plugin/class/permanent-storage', () => ({
  PermanentStorage: {
    getInstance: () => ({
      get: mockStorageGet,
      set: mockStorageSet,
    }),
  },
}));

jest.mock('@plugin/core/project/project-manager', () => ({ ProjectManager: { getInstance: () => mockProject } }));

jest.mock('@plugin/core/project/project', () => ({
  Project: {
    getInstance: () => ({
      workspaceIsProject: () => false,
      projectId: 0,
      projectPath: '',
    }),
  },
}));

jest.mock('@plugin/domain', () => ({ getConfig: mockGetConfig }));

import {
  getCacheFilePath,
  readWorkspaceCache,
  updateWorkspaceCache,
} from '@plugin/helpers/workspace-cache';
import { syncSanitizerPythonTargetFromActiveEditor } from '@plugin/helpers/sync-sanitizer-python-target';
import { runDataService } from '@plugin/service/run-data-service';

describe('sanitizer fileMapLists cache sync', () => {
  let tmpRoot: string;

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mstt-file-map-cache-'));
    mockProject.projectPath = tmpRoot;
    mockGetConfig.mockReset();
    mockStorageSet.mockClear();
    vscode.workspace.workspaceFolders = [{ uri: { fsPath: tmpRoot } }];
    delete (vscode.window as { activeTextEditor?: unknown }).activeTextEditor;
  });

  afterEach(() => {
    fs.rmSync(tmpRoot, {
      recursive: true,
      force: true,
    });
    jest.clearAllMocks();
  });

  describe('getSanitizerRunData fileMapList source', () => {
    it('reads the sanitizer list from the cache and ignores config rows', async () => {
      const reportFile = path.join(tmpRoot, 'op', 'report.json');
      const configRowReport = path.join(tmpRoot, 'op', 'from-config.json');

      fs.mkdirSync(path.dirname(reportFile), { recursive: true });
      fs.writeFileSync(reportFile, '{}', 'utf8');
      fs.writeFileSync(configRowReport, '{}', 'utf8');

      await updateWorkspaceCache(tmpRoot, (cache) => {
        cache.fileMapLists = {
          sanitizer: [
            {
              filePath: reportFile,
              reportTime: 1000,
            },
          ],
          simulate: [],
          on_board: [],
        };
      });

      // The config row holds a DIFFERENT list — it must not be used while the cache exists.
      mockGetConfig.mockReturnValue([
        {
          config_id: 1,
          user_options: {
            fileMapList: [
              {
                filePath: configRowReport,
                reportTime: 999,
              },
            ],
          },
        },
      ]);

      const result = await runDataService.getSanitizerRunData();

      expect(result)
        .toHaveLength(1);
      expect(result[0])
        .toEqual({
          title: 'report.json',
          timestamp: 1000,
          id: `sanitizer_${reportFile}`,
          path: reportFile,
          marked: false,
        });
    });

    it('returns an empty list when the cache has no fileMapLists section (config rows are no longer consulted)', async () => {
      const reportFile = path.join(tmpRoot, 'op', 'from-config.json');

      fs.mkdirSync(path.dirname(reportFile), { recursive: true });
      fs.writeFileSync(reportFile, '{}', 'utf8');

      // Cache file exists, but the fileMapLists section was never created (or was
      // created without a sanitizer entry) — no config-row fallback exists anymore.
      await updateWorkspaceCache(tmpRoot, (cache) => {
        cache.sanitizerPythonTarget = { other: 'python3 other.py' };
      });

      mockGetConfig.mockReturnValue([
        {
          config_id: 1,
          user_options: {
            fileMapList: [
              {
                filePath: reportFile,
                reportTime: 2000,
              },
            ],
          },
        },
      ]);

      const result = await runDataService.getSanitizerRunData();

      expect(result)
        .toHaveLength(0);
    });
  });

  describe('syncSanitizerPythonTargetFromActiveEditor', () => {
    it('writes the target to cache.sanitizerPythonTarget keyed by the root op name', async () => {
      const pyFile = path.join(tmpRoot, 'op', 'triton2.py');

      (vscode.window as {
        activeTextEditor?: { document: { fileName: string;
          uri: { fsPath: string } } };
      }).activeTextEditor = {
        document: {
          fileName: pyFile,
          uri: { fsPath: pyFile },
        },
      };

      const result = await syncSanitizerPythonTargetFromActiveEditor('.py');

      expect(result)
        .toBe(true);
      expect(readWorkspaceCache(tmpRoot).sanitizerPythonTarget)
        .toEqual({ [path.basename(tmpRoot)]: 'python3 op/triton2.py' });
    });

    it('reuses the captured target without writing when no editor is active', async () => {
      const opKey = path.basename(tmpRoot);

      await updateWorkspaceCache(tmpRoot, (cache) => {
        cache.sanitizerPythonTarget = { [opKey]: 'python3 old.py' };
      });

      const result = await syncSanitizerPythonTargetFromActiveEditor('.py');

      expect(result)
        .toBe(true);
      expect(readWorkspaceCache(tmpRoot).sanitizerPythonTarget)
        .toEqual({ [opKey]: 'python3 old.py' });
    });

    it('warns and returns false when nothing was captured and no editor is active', async () => {
      const result = await syncSanitizerPythonTargetFromActiveEditor('.py');

      expect(result)
        .toBe(false);
      expect(vscode.window.showWarningMessage)
        .toHaveBeenCalled();
      expect(fs.existsSync(getCacheFilePath(tmpRoot)))
        .toBe(false);
    });

    it('warns and returns false when the focused file lies outside the workspace', async () => {
      const outsideFile = path.join(os.tmpdir(), 'outside-op.py');

      (vscode.window as {
        activeTextEditor?: { document: { fileName: string;
          uri: { fsPath: string } } };
      }).activeTextEditor = {
        document: {
          fileName: outsideFile,
          uri: { fsPath: outsideFile },
        },
      };

      const result = await syncSanitizerPythonTargetFromActiveEditor('.py');

      expect(result)
        .toBe(false);
      expect(vscode.window.showWarningMessage)
        .toHaveBeenCalled();
      expect(fs.existsSync(getCacheFilePath(tmpRoot)))
        .toBe(false);
    });
  });
});
