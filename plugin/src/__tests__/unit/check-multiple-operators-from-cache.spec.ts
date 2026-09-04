jest.mock('i18next', () => ({ t: (key: string) => key }));

jest.mock('@plugin/service/config-service', () => ({ ConfigService: { writeOpDevtoolsDottedSettings: jest.fn() } }));

jest.mock('@plugin/domain/services/operator-project-detector', () => ({
  OperatorProjectType: {
    STANDARD_CUSTOM: 'standard-custom',
    ASCEND_C: 'ascend-c',
    TORCH_LIBRARY: 'torch-library',
    PYASC: 'pyasc',
    TRITON: 'triton',
    MULTI_PROJECT: 'multi-project',
  },
  OperatorProjectDetector: { detectOperatorProject: jest.fn() },
}));

jest.mock('@plugin/domain/models/project-model', () => {
  const actual = jest.requireActual('@plugin/domain/models/project-model');

  return {
    ...actual,
    getProjectByPath: jest.fn(),
  };
});

jest.mock('@plugin/domain/plugins/detection-utils', () => ({ buildShHelpSupportsGenop: jest.fn() }));

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';

import { OperatorProjectDetector } from '@plugin/domain/services/operator-project-detector';
import {
  getProjectByPath, normalizeProjectPath,
} from '@plugin/domain/models/project-model';
import { buildShHelpSupportsGenop } from '@plugin/domain/plugins/detection-utils';
import {
  checkMultipleOperatorsCore, type CheckMultipleOperatorsResult, type OperatorListEntry,
} from '@plugin/helpers/check-multiple-operators';
import {
  CACHE_SCHEMA_VERSION, type FolderScanState, type WorkspaceCache, getCacheFilePath,
} from '@plugin/helpers/workspace-cache';

describe('checkMultipleOperatorsCore from cache', () => {
  let tmpRoot: string;

  const folderState: FolderScanState = {
    opsMeet: [
      {
        name: 'collection_root',
        path: '/c/root',
      },
    ],
    opsList: [
      {
        name: 'add_custom',
        path: '/c/root/add_custom',
      },
      {
        name: 'built_op',
        path: '/c/root/built_op',
        isCompiled: true,
      },
    ],
    experimentalOpsList: [
      {
        name: 'exp_op',
        path: '/c/root/experimental/exp_op',
      },
    ],
  };

  function writeCache(cache: Partial<WorkspaceCache>): void {
    fs.mkdirSync(path.dirname(getCacheFilePath(tmpRoot)), { recursive: true });
    fs.writeFileSync(
      getCacheFilePath(tmpRoot),
      JSON.stringify({
        schemaVersion: CACHE_SCHEMA_VERSION,
        ...cache,
      }),
      'utf8',
    );
  }

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'op-devtools-multiops-'));
    (getProjectByPath as jest.Mock).mockReset();
    (OperatorProjectDetector.detectOperatorProject as jest.Mock).mockReset();
    (buildShHelpSupportsGenop as jest.Mock).mockReset()
      .mockResolvedValue(true);
  });

  afterEach(() => {
    fs.rmSync(tmpRoot, {
      recursive: true,
      force: true,
    });
  });

  describe('standard-custom root', () => {
    it('builds operators from cache.folders with synthesized ids and isExperimental flags', async () => {
      (getProjectByPath as jest.Mock).mockReturnValue({
        project_name: 'root',
        project_path: tmpRoot,
        project_type: 'ascend',
      });
      writeCache({ folders: { [normalizeProjectPath(tmpRoot)]: folderState } });

      const result = await checkMultipleOperatorsCore(tmpRoot);

      expect(result)
        .toEqual<CheckMultipleOperatorsResult>({
          hasMultiple: true,
          isStandardCustom: true,
          operators: [
            {
              id: 0,
              name: 'add_custom',
              path: '/c/root/add_custom',
              isExperimental: false,
              isCompiled: false,
            },
            {
              id: 1,
              name: 'built_op',
              path: '/c/root/built_op',
              isExperimental: false,
              isCompiled: true,
            },
            {
              id: 1000,
              name: 'exp_op',
              path: '/c/root/experimental/exp_op',
              isExperimental: true,
              isCompiled: false,
            },
          ],
        });
      expect(OperatorProjectDetector.detectOperatorProject)
        .not
        .toHaveBeenCalled();
    });

    it('does not call detection when the DB record exists (project_type ascend)', async () => {
      (getProjectByPath as jest.Mock).mockReturnValue({
        project_name: 'root',
        project_path: tmpRoot,
        project_type: 'ascend',
      });
      writeCache({ folders: { [normalizeProjectPath(tmpRoot)]: folderState } });

      await checkMultipleOperatorsCore(tmpRoot);

      expect(OperatorProjectDetector.detectOperatorProject)
        .not
        .toHaveBeenCalled();
    });

    it('matches the cache folder key via normalizeProjectPath (trailing separator tolerated)', async () => {
      (getProjectByPath as jest.Mock).mockReturnValue({
        project_name: 'root',
        project_path: tmpRoot,
        project_type: 'ascend',
      });
      writeCache({ folders: { [normalizeProjectPath(tmpRoot)]: folderState } });

      const result = await checkMultipleOperatorsCore(`${tmpRoot}/`);

      expect(result.operators?.map((op) => op.id))
        .toEqual([
          0,
          1,
          1000,
        ]);
    });

    it('uses index-based ids and warns when no DB record exists', async () => {
      (getProjectByPath as jest.Mock).mockReturnValue(undefined);
      (OperatorProjectDetector.detectOperatorProject as jest.Mock).mockResolvedValue({
        isOperatorProject: true,
        projectType: 'standard-custom',
      });
      writeCache({ folders: { [normalizeProjectPath(tmpRoot)]: folderState } });
      const warnSpy = jest.spyOn(console, 'warn')
        .mockImplementation(() => {});

      const result = await checkMultipleOperatorsCore(tmpRoot);

      expect(result.operators)
        .toEqual([
          expect.objectContaining({
            id: 0,
            name: 'add_custom',
          }),
          expect.objectContaining({
            id: 1,
            name: 'built_op',
          }),
          expect.objectContaining({
            id: 1000,
            name: 'exp_op',
          }),
        ]);
      expect(warnSpy)
        .toHaveBeenCalledWith(expect.stringContaining('no project record was found'));
      warnSpy.mockRestore();
    });

    it('uses the workspace projectType setting as the first cascade source', async () => {
      const getConfigurationMock = vscode.workspace.getConfiguration as jest.Mock;
      const originalImplementation = getConfigurationMock.getMockImplementation();
      const inspectStore: Record<string, { key: string;
        workspaceFolderValue: string } | undefined> = {
        projectType: {
          key: 'projectType',
          workspaceFolderValue: 'ascend',
        },
      };

      getConfigurationMock.mockReturnValue({
        inspect: <T>(key: string) => inspectStore[key] as unknown as T | undefined,
        get: jest.fn(),
        update: jest.fn(),
      });
      (getProjectByPath as jest.Mock).mockReturnValue(undefined);
      writeCache({ folders: { [normalizeProjectPath(tmpRoot)]: folderState } });
      const warnSpy = jest.spyOn(console, 'warn')
        .mockImplementation(() => {});

      try {
        const result = await checkMultipleOperatorsCore(tmpRoot);

        expect(result.isStandardCustom)
          .toBe(true);
        expect(OperatorProjectDetector.detectOperatorProject)
          .not
          .toHaveBeenCalled();
        expect(result.operators?.map((op) => op.id))
          .toEqual([
            0,
            1,
            1000,
          ]);
      }
      finally {
        getConfigurationMock.mockImplementation(originalImplementation);
        warnSpy.mockRestore();
      }
    });

    it('falls back to detection when neither setting nor DB record is available', async () => {
      (getProjectByPath as jest.Mock).mockReturnValue(undefined);
      (OperatorProjectDetector.detectOperatorProject as jest.Mock).mockResolvedValue({
        isOperatorProject: true,
        projectType: 'standard-custom',
      });
      writeCache({ folders: { [normalizeProjectPath(tmpRoot)]: folderState } });

      const result = await checkMultipleOperatorsCore(tmpRoot);

      expect(result.isStandardCustom)
        .toBe(true);
      expect(OperatorProjectDetector.detectOperatorProject)
        .toHaveBeenCalledWith(tmpRoot);
      expect(result.operators?.map((op) => op.id))
        .toEqual([
          0,
          1,
          1000,
        ]);
    });

    it('returns an empty operator list when the cache has no folder scan state', async () => {
      (getProjectByPath as jest.Mock).mockReturnValue({
        project_name: 'root',
        project_path: tmpRoot,
        project_type: 'ascend',
      });
      // No cache.json at all.
      const result = await checkMultipleOperatorsCore(tmpRoot);

      expect(result)
        .toEqual({
          hasMultiple: false,
          operators: [],
          isStandardCustom: true,
        });
    });
  });

  describe('compiled status merge', () => {
    it('treats an operator as compiled when cache.project.compiledOpPaths marks its path', async () => {
      (getProjectByPath as jest.Mock).mockReturnValue({
        project_name: 'root',
        project_path: tmpRoot,
        project_type: 'ascend',
      });
      writeCache({
        folders: { [normalizeProjectPath(tmpRoot)]: folderState },
        project: {
          selectedOperatorPaths: [],
          compiledOpPaths: { '/c/root/add_custom': true },
        },
      });

      const result = await checkMultipleOperatorsCore(tmpRoot);

      const byName = new Map(result.operators!.map((op: OperatorListEntry) => [
        op.name,
        op,
      ]));

      expect(byName.get('add_custom'))
        .toMatchObject({ isCompiled: true });
      // Folder-level isCompiled remains true even without a compiledOpPaths entry.
      expect(byName.get('built_op'))
        .toMatchObject({ isCompiled: true });
      expect(byName.get('exp_op'))
        .toMatchObject({ isCompiled: false });
    });
  });

  describe('non-standard-custom', () => {
    it('scans for devtool config operator projects (fallback detection)', async () => {
      (getProjectByPath as jest.Mock).mockReturnValue(undefined);
      (OperatorProjectDetector.detectOperatorProject as jest.Mock).mockResolvedValue({
        isOperatorProject: true,
        projectType: 'cann',
      });

      const op1 = path.join(tmpRoot, 'op1');
      const op2 = path.join(tmpRoot, 'nested', 'op2');

      fs.mkdirSync(path.join(op1, '.vscode'), { recursive: true });
      fs.mkdirSync(path.join(op2, '.vscode'), { recursive: true });
      fs.writeFileSync(path.join(op1, '.vscode', 'devtool_config.json'), '{}');
      fs.writeFileSync(path.join(op2, '.vscode', 'devtool_config.json'), '{}');

      const result = await checkMultipleOperatorsCore(tmpRoot);

      expect(result)
        .toMatchObject<CheckMultipleOperatorsResult>({
          hasMultiple: true,
          isStandardCustom: false,
        });
      // readdirSync order is OS-dependent; match entries by name instead.
      const byName = new Map(result.operators!.map((op) => [
        op.name,
        op,
      ]));

      expect(byName.get('op1'))
        .toMatchObject({
          path: op1,
          isExperimental: false,
          isCompiled: false,
        });
      expect(byName.get('op2'))
        .toMatchObject({
          path: op2,
          isExperimental: false,
          isCompiled: false,
        });
      expect(result.operators!.map((op) => op.id)
        .sort((a, b) => a - b))
        .toEqual([
          900000,
          900001,
        ]);
    });
  });
});
