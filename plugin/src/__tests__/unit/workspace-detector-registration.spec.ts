import * as path from 'path';

jest.mock('@plugin/domain/services/operator-project-detector', () => ({
  OperatorProjectType: { STANDARD_CUSTOM: 'standard-custom' },
  OperatorProjectDetector: { detectOperatorProject: jest.fn() },
}));

type Row = {
  project_name?: string;
  project_path: string;
  project_type?: string;
  template_name?: string;
  ops_list?: unknown[];
  experimental_ops_list?: unknown[];
};

jest.mock('@plugin/domain/models/project-model', () => {
  const actual = jest.requireActual('@plugin/domain/models/project-model') as Record<string, unknown>;
  const rows: Row[] = [];
  const normalize = actual.normalizeProjectPath as (projectPath: string)=> string;

  return {
    ...actual,
    getProjectByPath: jest.fn((projectPath: string) =>
      rows.find((row) => normalize(row.project_path) === normalize(projectPath))),
    createProject: jest.fn(async (row: Row) => {
      rows.push(row);
    }),
    _resetProjectsForTest: () => {
      rows.length = 0;
    },
  };
});

// Registration writes the scan into the workspace cache
// (cache.folders[rootKey]) instead of a projects.json row: mock the cache at
// the read/write boundary with an in-memory folders store so the service's
// merge logic runs against a real mutate sequence.
jest.mock('@plugin/helpers/workspace-cache', () => {
  const actual = jest.requireActual('@plugin/helpers/workspace-cache') as Record<string, unknown>;
  const state: { folders: Record<string, unknown> } = { folders: {} };

  return {
    ...actual,
    __setCacheFoldersForTest: (folders: Record<string, unknown>) => {
      state.folders = folders;
    },
    readWorkspaceCache: jest.fn(() => ({
      schemaVersion: 1,
      folders: state.folders,
    })),
    updateWorkspaceCache: jest.fn(async (_root: string, mutate: (cache: Record<string, unknown>)=> void) => {
      const cache = {
        schemaVersion: 1,
        folders: state.folders,
      };

      mutate(cache);
      state.folders = cache.folders;

      return true;
    }),
    updateFolderScanState: jest.fn(),
  };
});

jest.mock('@plugin/service/config-service', () => ({
  ConfigService: {
    writeOpDevtoolsDottedSettings: jest.fn()
      .mockResolvedValue(true),
  },
}));

import {
  OperatorProjectDetector,
  OperatorProjectType,
} from '@plugin/domain/services/operator-project-detector';
import {
  _resetProjectsForTest,
  createProject,
  normalizeProjectPath,
} from '@plugin/domain/models/project-model';
import {
  appendOperatorToFolderScanState,
  readWorkspaceCache,
  updateWorkspaceCache,
  type FolderScanState,
} from '@plugin/helpers/workspace-cache';
import { WorkspaceDetectorService } from '@plugin/service/workspace-detector-service';
import { ConfigService } from '@plugin/service/config-service';

const workspaceCache = jest.requireMock('@plugin/helpers/workspace-cache') as unknown as {
  __setCacheFoldersForTest: (folders: Record<string, unknown>)=> void;
};

const workspacePath = '/repo/ops-math';
const normalizedWorkspacePath = path.normalize(workspacePath);
const rootKey = normalizeProjectPath(workspacePath);
const scannedOperators = {
  opsMeet: [
    {
      name: 'math',
      path: '/repo/ops-math/math',
    },
  ],
  opsList: [
    {
      name: 'add',
      path: '/repo/ops-math/math/add',
      isCompiled: false,
    },
  ],
  experimentalOpsList: [],
};

const detection = {
  isOperatorProject: true,
  projectType: OperatorProjectType.STANDARD_CUSTOM,
  projectPath: workspacePath,
  projectName: 'ops-math',
};

describe('WorkspaceDetectorService standard-custom registration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    _resetProjectsForTest();
    workspaceCache.__setCacheFoldersForTest({});
    (OperatorProjectDetector.detectOperatorProject as jest.Mock).mockResolvedValue(detection);
    jest.spyOn(WorkspaceDetectorService, 'scanOpsMeetAndOpsLists')
      .mockReturnValue(scannedOperators);
  });

  afterEach(() => {
    _resetProjectsForTest();
    jest.restoreAllMocks();
  });

  it('registers one missing root: writes the canonical type and persists the scanned operators into the cache', async () => {
    await WorkspaceDetectorService.detectAndRegisterWorkspace(workspacePath);

    expect(OperatorProjectDetector.detectOperatorProject)
      .toHaveBeenCalledTimes(1);
    expect(ConfigService.writeOpDevtoolsDottedSettings)
      .toHaveBeenCalledWith({ projectType: 'ascend' }, normalizedWorkspacePath);
    expect(readWorkspaceCache(workspacePath).folders?.[rootKey])
      .toEqual({
        opsMeet: scannedOperators.opsMeet,
        opsList: scannedOperators.opsList,
        experimentalOpsList: scannedOperators.experimentalOpsList,
      });
  });

  it('reuses an existing collection and merges scanned operators without losing metadata', async () => {
    workspaceCache.__setCacheFoldersForTest({
      [rootKey]: {
        opsMeet: [],
        opsList: [
          {
            name: 'existing',
            path: '/repo/ops-math/math/existing',
            isCompiled: true,
          },
        ],
        experimentalOpsList: [],
      },
    });
    await createProject({
      project_name: 'custom-name',
      project_path: workspacePath,
      project_type: 'ascend',
      template_name: 'preserved-template',
      ops_list: [
        {
          name: 'existing',
          path: '/repo/ops-math/math/existing',
          isCompiled: true,
        },
      ],
    });

    await WorkspaceDetectorService.detectAndRegisterWorkspace(workspacePath);

    expect(OperatorProjectDetector.detectOperatorProject).not.toHaveBeenCalled();
    expect(readWorkspaceCache(workspacePath).folders?.[rootKey])
      .toMatchObject({
        opsMeet: scannedOperators.opsMeet,
        opsList: expect.arrayContaining([
          expect.objectContaining({
            name: 'existing',
            isCompiled: true,
          }),
          expect.objectContaining({ name: 'add' }),
        ]),
      });
  });

  it('normalizes a detected root to the canonical stored type', async () => {
    await createProject({
      project_name: 'ops-math',
      project_path: workspacePath,
    });

    await WorkspaceDetectorService.detectAndRegisterWorkspace(workspacePath);

    expect(OperatorProjectDetector.detectOperatorProject)
      .toHaveBeenCalledTimes(1);
    // No registry row mutation: the canonical type is persisted as
    // the workspace `projectType` setting, which the synthesized record
    // (getProjectByPath) reads back.
    expect(ConfigService.writeOpDevtoolsDottedSettings)
      .toHaveBeenCalledWith({ projectType: 'ascend' }, normalizedWorkspacePath);
  });

  it('accepts a newly scanned compiled state and reconciles list classification', async () => {
    workspaceCache.__setCacheFoldersForTest({
      [rootKey]: {
        opsMeet: [],
        opsList: [
          {
            name: 'add',
            path: '/repo/ops-math/math/add',
            isCompiled: false,
          },
        ],
        experimentalOpsList: [],
      },
    });
    await createProject({
      project_name: 'ops-math',
      project_path: workspacePath,
      project_type: 'ascend',
      ops_list: [
        {
          name: 'add',
          path: '/repo/ops-math/math/add',
          isCompiled: false,
        },
      ],
    });
    (WorkspaceDetectorService.scanOpsMeetAndOpsLists as jest.Mock).mockReturnValue({
      opsMeet: scannedOperators.opsMeet,
      opsList: [],
      experimentalOpsList: [
        {
          name: 'add',
          path: '/repo/ops-math/math/add',
          isCompiled: true,
        },
      ],
    });

    await WorkspaceDetectorService.detectAndRegisterWorkspace(workspacePath);

    const state = readWorkspaceCache(workspacePath).folders?.[rootKey] as FolderScanState;

    expect(state.opsList)
      .toEqual([]);
    expect(state.experimentalOpsList)
      .toEqual([
        expect.objectContaining({
          name: 'add',
          isCompiled: true,
        }),
      ]);
  });

  it('single-flights equivalent paths and allows a later refresh', async () => {
    await Promise.all([
      WorkspaceDetectorService.detectAndRegisterWorkspace(workspacePath),
      WorkspaceDetectorService.detectAndRegisterWorkspace(`${workspacePath}${path.sep}`),
    ]);

    expect(OperatorProjectDetector.detectOperatorProject)
      .toHaveBeenCalledTimes(1);
    expect(WorkspaceDetectorService.scanOpsMeetAndOpsLists)
      .toHaveBeenCalledTimes(1);
    expect(updateWorkspaceCache)
      .toHaveBeenCalledTimes(1);

    await WorkspaceDetectorService.detectAndRegisterWorkspace(workspacePath);

    expect(updateWorkspaceCache)
      .toHaveBeenCalledTimes(2);
    expect(WorkspaceDetectorService.scanOpsMeetAndOpsLists)
      .toHaveBeenCalledTimes(2);
  });

  it('surfaces a root scan failure to the caller', async () => {
    (WorkspaceDetectorService.scanOpsMeetAndOpsLists as jest.Mock).mockImplementation(() => {
      throw new Error('scan failed');
    });

    await expect(WorkspaceDetectorService.detectAndRegisterWorkspace(workspacePath))
      .rejects.toThrow('scan failed');
  });
});

describe('standard-custom child persistence (cache scan state)', () => {
  it('preserves overlapping child appends', async () => {
    let state: FolderScanState = {
      opsMeet: [],
      opsList: [],
      experimentalOpsList: [],
    };

    state = appendOperatorToFolderScanState(state, {
      name: 'add',
      path: '/repo/ops-math/math/add',
      isCompiled: false,
    }, false);
    state = appendOperatorToFolderScanState(state, {
      name: 'sub',
      path: '/repo/ops-math/math/sub',
      isCompiled: false,
    }, false);

    expect(state.opsList)
      .toEqual(expect.arrayContaining([
        expect.objectContaining({ name: 'add' }),
        expect.objectContaining({ name: 'sub' }),
      ]));
  });

  it('deduplicates an equivalent child path across regular and experimental lists', () => {
    const state = appendOperatorToFolderScanState({
      opsMeet: [],
      opsList: [],
      experimentalOpsList: [
        {
          name: 'add',
          path: '/repo/ops-math/math/add/',
          isCompiled: true,
        },
      ],
    }, {
      name: 'add',
      path: '/repo/ops-math/math/add',
      isCompiled: false,
    }, false);

    expect(state.opsList)
      .toEqual([
        expect.objectContaining({
          name: 'add',
          isCompiled: true,
        }),
      ]);
    expect(state.experimentalOpsList)
      .toEqual([]);
  });

  it('collapses stored duplicates already present in the target list', () => {
    const state = appendOperatorToFolderScanState({
      opsMeet: [],
      opsList: [
        {
          name: 'add-old',
          path: '/repo/ops-math/math/add/',
          isCompiled: true,
        },
        {
          name: 'add-copy',
          path: '/repo/ops-math/math/add',
          isCompiled: false,
        },
      ],
      experimentalOpsList: [],
    }, {
      name: 'add',
      path: '/repo/ops-math/math/add',
      isCompiled: true,
    }, false);

    expect(state.opsList)
      .toEqual([
        expect.objectContaining({
          name: 'add',
          isCompiled: true,
        }),
      ]);
  });
});
