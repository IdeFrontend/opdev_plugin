import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

jest.mock('@plugin/domain/models/config', () => {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'op-devtools-workspace-registration-'));

  (globalThis as Record<string, string>).__workspaceRegistrationUserDataDir = userDataDir;

  return {
    __esModule: true,
    default: { user_data_dir: userDataDir },
  };
});

jest.mock('@plugin/domain/services/operator-project-detector', () => ({
  OperatorProjectType: { STANDARD_CUSTOM: 'standard-custom' },
  OperatorProjectDetector: { detectOperatorProject: jest.fn() },
}));

import {
  OperatorProjectDetector,
  OperatorProjectType,
} from '@plugin/domain/services/operator-project-detector';
import {
  _resetProjectsForTest,
  appendStandardCustomOperator,
  createProject,
  getAllProjects,
  getProjectByPath,
} from '@plugin/domain/models/project-model';
import { WorkspaceDetectorService } from '@plugin/service/workspace-detector-service';

const workspacePath = '/repo/ops-math';
const normalizedWorkspacePath = path.normalize(workspacePath);
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
    (OperatorProjectDetector.detectOperatorProject as jest.Mock).mockResolvedValue(detection);
    jest.spyOn(WorkspaceDetectorService, 'scanOpsMeetAndOpsLists')
      .mockReturnValue(scannedOperators);
  });

  afterEach(() => {
    _resetProjectsForTest();
    jest.restoreAllMocks();
  });

  it('persists one missing root as ascend before applying the scan', async () => {
    await WorkspaceDetectorService.detectAndRegisterWorkspace(workspacePath);

    expect(getAllProjects())
      .toHaveLength(1);
    expect(getProjectByPath(workspacePath))
      .toMatchObject({
        project_name: 'ops-math',
        project_path: normalizedWorkspacePath,
        project_type: 'ascend',
        ops_meet: scannedOperators.opsMeet,
        ops_list: scannedOperators.opsList,
        experimental_ops_list: [],
      });
  });

  it('reuses an existing collection and merges scanned operators without losing metadata', async () => {
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
    expect(getAllProjects())
      .toHaveLength(1);
    expect(getProjectByPath(workspacePath))
      .toMatchObject({
        project_name: 'custom-name',
        template_name: 'preserved-template',
        ops_list: expect.arrayContaining([
          expect.objectContaining({
            name: 'existing',
            isCompiled: true,
          }),
          expect.objectContaining({ name: 'add' }),
        ]),
      });
  });

  it('normalizes a detected legacy root to the canonical stored type', async () => {
    await createProject({
      project_name: 'ops-math',
      project_path: workspacePath,
    });

    await WorkspaceDetectorService.detectAndRegisterWorkspace(workspacePath);

    expect(OperatorProjectDetector.detectOperatorProject)
      .toHaveBeenCalledTimes(1);
    expect(getProjectByPath(workspacePath)?.project_type)
      .toBe('ascend');
  });

  it('accepts a newly scanned compiled state and reconciles list classification', async () => {
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

    const root = getProjectByPath(workspacePath);

    expect(root?.ops_list)
      .toEqual([]);
    expect(root?.experimental_ops_list)
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

    expect(getAllProjects())
      .toHaveLength(1);
    expect(OperatorProjectDetector.detectOperatorProject)
      .toHaveBeenCalledTimes(1);
    expect(WorkspaceDetectorService.scanOpsMeetAndOpsLists)
      .toHaveBeenCalledTimes(1);

    await WorkspaceDetectorService.detectAndRegisterWorkspace(workspacePath);

    expect(getAllProjects())
      .toHaveLength(1);
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

describe('standard-custom child persistence', () => {
  beforeEach(() => {
    _resetProjectsForTest();
  });

  afterEach(() => {
    _resetProjectsForTest();
  });

  it('atomically preserves overlapping child appends', async () => {
    await createProject({
      project_name: 'ops-math',
      project_path: workspacePath,
      project_type: 'ascend',
    });

    await Promise.all([
      appendStandardCustomOperator(
        workspacePath,
        {
          name: 'add',
          path: '/repo/ops-math/math/add',
          isCompiled: false,
        },
        false,
      ),
      appendStandardCustomOperator(
        workspacePath,
        {
          name: 'sub',
          path: '/repo/ops-math/math/sub',
          isCompiled: false,
        },
        false,
      ),
    ]);

    expect(getProjectByPath(workspacePath)?.ops_list)
      .toEqual(expect.arrayContaining([
        expect.objectContaining({ name: 'add' }),
        expect.objectContaining({ name: 'sub' }),
      ]));
  });

  it('deduplicates an equivalent child path across regular and experimental lists', async () => {
    await createProject({
      project_name: 'ops-math',
      project_path: `${workspacePath}${path.sep}`,
      project_type: 'ascend',
      experimental_ops_list: [
        {
          name: 'add',
          path: '/repo/ops-math/math/add/',
          isCompiled: true,
        },
      ],
    });

    await appendStandardCustomOperator(
      workspacePath,
      {
        name: 'add',
        path: '/repo/ops-math/math/add',
        isCompiled: false,
      },
      false,
    );

    const root = getProjectByPath(workspacePath);

    expect(root?.ops_list)
      .toEqual([
        expect.objectContaining({
          name: 'add',
          isCompiled: true,
        }),
      ]);
    expect(root?.experimental_ops_list)
      .toEqual([]);
  });

  it('collapses legacy duplicates already present in the target list', async () => {
    await createProject({
      project_name: 'ops-math',
      project_path: workspacePath,
      project_type: 'ascend',
      ops_list: [
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
    });

    await appendStandardCustomOperator(
      workspacePath,
      {
        name: 'add',
        path: '/repo/ops-math/math/add',
        isCompiled: true,
      },
      false,
    );

    expect(getProjectByPath(workspacePath)?.ops_list)
      .toEqual([
        expect.objectContaining({
          name: 'add',
          isCompiled: true,
        }),
      ]);
  });
});

afterAll(() => {
  fs.rmSync(
    (globalThis as Record<string, string>).__workspaceRegistrationUserDataDir,
    {
      recursive: true,
      force: true,
    },
  );
});
