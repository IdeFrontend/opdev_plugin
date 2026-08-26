import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const mockReaddirSync = jest.fn();

jest.mock('fs', () => {
  const realFs = jest.requireActual('fs') as Record<string, unknown>;

  return {
    ...realFs,
    readdirSync: (...args: unknown[]) => mockReaddirSync(...args),
  };
});

const realFs = jest.requireActual('fs') as typeof import('fs');

jest.mock('@plugin/domain/services/operator-project-detector', () => ({
  OperatorProjectType: { STANDARD_CUSTOM: 'standard-custom' },
  OperatorProjectDetector: { detectOperatorProject: jest.fn() },
}));

jest.mock('@plugin/domain/models/project-model', () => {
  const actual = jest.requireActual('@plugin/domain/models/project-model') as Record<string, unknown>;

  return {
    ...actual,
    getProjectByPath: jest.fn(),
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
  getProjectByPath,
  normalizeProjectPath,
} from '@plugin/domain/models/project-model';
import { resetWorkspaceCacheChainsForTest } from '@plugin/helpers/workspace-cache';
import { WorkspaceDetectorService } from '@plugin/service/workspace-detector-service';
import { ConfigService } from '@plugin/service/config-service';

const detectOperatorProject = OperatorProjectDetector.detectOperatorProject as jest.Mock;
const getProjectByPathMock = getProjectByPath as jest.Mock;
const writeSettings = ConfigService.writeOpDevtoolsDottedSettings as jest.Mock;

const tmpRoots: string[] = [];

function mkTmp(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wsdet-'));

  tmpRoots.push(dir);

  return dir;
}

afterEach(() => {
  while (tmpRoots.length > 0) {
    const dir = tmpRoots.pop();

    fs.rmSync(dir, {
      recursive: true,
      force: true,
    });
  }
});

function readCache(workspacePath: string): {
  folders: Record<string, {
    opsMeet: Array<{ name: string;
      path: string }>;
    opsList: Array<{ name: string;
      isCompiled?: boolean }>;
    experimentalOpsList: Array<{ name: string;
      isCompiled?: boolean }>;
  }>;
} {
  return JSON.parse(fs.readFileSync(path.join(workspacePath, '.vscode', 'cache.json'), 'utf8'));
}

/**
 * Standard-custom tree: whitelisted collections with operators, an
 * experimental whitelisted collection, a non-whitelisted experimental
 * collection, filtered entries (dot / node_modules / out / build) and files.
 */
function scaffoldStandardCustomRoot(workspacePath: string): void {
  fs.mkdirSync(path.join(workspacePath, 'math', 'add'), { recursive: true });
  fs.writeFileSync(path.join(workspacePath, 'math', 'add', 'CMakeLists.txt'), '');
  fs.mkdirSync(path.join(workspacePath, 'math', 'mul'), { recursive: true });
  fs.writeFileSync(path.join(workspacePath, 'math', 'mul', 'CMakeLists.txt'), '');
  fs.mkdirSync(path.join(workspacePath, 'math', 'add2', 'out'), { recursive: true });
  fs.writeFileSync(path.join(workspacePath, 'math', 'add2', 'CMakeLists.txt'), '');
  fs.mkdirSync(path.join(workspacePath, 'objdetect', 'det', 'build'), { recursive: true });
  fs.writeFileSync(path.join(workspacePath, 'objdetect', 'det', 'CMakeLists.txt'), '');
  fs.mkdirSync(path.join(workspacePath, 'math', 'nonop'), { recursive: true });
  fs.mkdirSync(path.join(workspacePath, 'math', '.secret'), { recursive: true });
  fs.writeFileSync(path.join(workspacePath, 'math', '.secret', 'CMakeLists.txt'), '');
  fs.writeFileSync(path.join(workspacePath, 'math', 'notes.txt'), '');
  fs.mkdirSync(path.join(workspacePath, 'conversion'), { recursive: true });
  fs.mkdirSync(path.join(workspacePath, 'experimental', 'npu_ops_math_ext', 'expop'), { recursive: true });
  fs.writeFileSync(path.join(workspacePath, 'experimental', 'npu_ops_math_ext', 'expop', 'CMakeLists.txt'), '');
  fs.mkdirSync(path.join(workspacePath, 'experimental', 'random'), { recursive: true });
  fs.mkdirSync(path.join(workspacePath, 'experimental', 'zzz', 'op1'), { recursive: true });
  fs.writeFileSync(path.join(workspacePath, 'experimental', 'zzz', 'op1', 'CMakeLists.txt'), '');
  fs.mkdirSync(path.join(workspacePath, 'experimental', '.hidden'), { recursive: true });
  fs.writeFileSync(path.join(workspacePath, 'experimental', 'readme.txt'), '');
  fs.mkdirSync(path.join(workspacePath, '.git'), { recursive: true });
  fs.mkdirSync(path.join(workspacePath, 'node_modules'), { recursive: true });
  fs.mkdirSync(path.join(workspacePath, 'out'), { recursive: true });
  fs.mkdirSync(path.join(workspacePath, 'build'), { recursive: true });
  fs.writeFileSync(path.join(workspacePath, 'readme.txt'), '');
}

describe('WorkspaceDetectorService real scan (standard custom)', () => {
  let workspacePath: string;
  let rootKey: string;

  beforeEach(() => {
    jest.clearAllMocks();
    mockReaddirSync.mockImplementation(((...args: unknown[]) =>
      (realFs.readdirSync as (...a: unknown[])=> unknown)(...args)) as never);
    resetWorkspaceCacheChainsForTest();
    workspacePath = mkTmp();
    rootKey = normalizeProjectPath(workspacePath);
    getProjectByPathMock.mockReturnValue(undefined);
    detectOperatorProject.mockResolvedValue({
      isOperatorProject: true,
      projectType: OperatorProjectType.STANDARD_CUSTOM,
      projectPath: workspacePath,
      projectName: path.basename(workspacePath),
    });
  });

  it('collects whitelisted collections and operators with compiled state', async () => {
    scaffoldStandardCustomRoot(workspacePath);

    await WorkspaceDetectorService.detectAndRegisterWorkspace(workspacePath);

    expect(detectOperatorProject)
      .toHaveBeenCalledWith(workspacePath);
    expect(writeSettings)
      .toHaveBeenCalledWith({ projectType: 'ascend' }, workspacePath);
    const cache = readCache(workspacePath);

    expect(cache.folders[rootKey].opsMeet)
      .toEqual(expect.arrayContaining([
        {
          name: 'math',
          path: path.join(workspacePath, 'math'),
        },
        {
          name: 'objdetect',
          path: path.join(workspacePath, 'objdetect'),
        },
        {
          name: 'experimental/npu_ops_math_ext',
          path: path.join(workspacePath, 'experimental', 'npu_ops_math_ext'),
        },
      ]));
    expect(cache.folders[rootKey].opsList)
      .toEqual(expect.arrayContaining([
        expect.objectContaining({
          name: 'add',
          isCompiled: false,
        }),
        expect.objectContaining({
          name: 'mul',
          isCompiled: false,
        }),
        expect.objectContaining({
          name: 'add2',
          isCompiled: true,
        }),
        expect.objectContaining({
          name: 'det',
          isCompiled: true,
        }),
      ]));
    expect(cache.folders[rootKey].experimentalOpsList)
      .toEqual([
        expect.objectContaining({
          name: 'expop',
          isCompiled: false,
        }),
      ]);
    expect(cache.folders[rootKey].opsList.some((o) => o.name === '.secret' || o.name === 'notes.txt'))
      .toBe(false);
  });

  it('preserves compiled state and stale entries across rescans', async () => {
    scaffoldStandardCustomRoot(workspacePath);
    const addPath = path.join(workspacePath, 'math', 'add');
    const stalePath = path.join(workspacePath, 'math', 'gone');
    const expPath = path.join(workspacePath, 'experimental', 'npu_ops_math_ext', 'expop');

    fs.mkdirSync(path.join(workspacePath, '.vscode'), { recursive: true });
    fs.writeFileSync(path.join(workspacePath, '.vscode', 'cache.json'), JSON.stringify({
      schemaVersion: 1,
      folders: {
        [rootKey]: {
          opsMeet: [],
          opsList: [
            {
              name: 'add',
              path: addPath,
              isCompiled: true,
            },
            {
              name: 'mul',
              path: path.join(workspacePath, 'math', 'mul'),
              isCompiled: false,
            },
            {
              name: 'gone',
              path: stalePath,
              isCompiled: true,
            },
          ],
          experimentalOpsList: [
            {
              name: 'expop',
              path: expPath,
              isCompiled: true,
            },
          ],
        },
      },
    }));

    await WorkspaceDetectorService.detectAndRegisterWorkspace(workspacePath);

    const cache = readCache(workspacePath);
    const state = cache.folders[rootKey];

    expect(state.opsList)
      .toEqual(expect.arrayContaining([
        expect.objectContaining({
          name: 'add',
          isCompiled: true,
        }),
        expect.objectContaining({
          name: 'mul',
          isCompiled: false,
        }),
        expect.objectContaining({
          name: 'gone',
          isCompiled: true,
        }),
      ]));
    expect(state.experimentalOpsList)
      .toEqual([
        expect.objectContaining({
          name: 'expop',
          isCompiled: true,
        }),
      ]);
  });

  it('skips detection when the root record already matches the stored type', async () => {
    scaffoldStandardCustomRoot(workspacePath);
    getProjectByPathMock.mockReturnValue({
      project_name: 'x',
      project_path: workspacePath,
      project_type: 'ascend',
    });

    await WorkspaceDetectorService.detectAndRegisterWorkspace(workspacePath);

    expect(detectOperatorProject).not.toHaveBeenCalled();
    expect(writeSettings)
      .toHaveBeenCalledWith({ projectType: 'ascend' }, workspacePath);
  });

  it('returns early when the root is not an operator project', async () => {
    detectOperatorProject.mockResolvedValue({
      isOperatorProject: false,
      projectPath: workspacePath,
      projectName: 'x',
    });

    await WorkspaceDetectorService.detectAndRegisterWorkspace(workspacePath);

    expect(writeSettings).not.toHaveBeenCalled();
    expect(fs.existsSync(path.join(workspacePath, '.vscode', 'cache.json')))
      .toBe(false);
  });

  it('returns early when the detected type is not standard-custom', async () => {
    detectOperatorProject.mockResolvedValue({
      isOperatorProject: true,
      projectType: 'pyasc',
      projectPath: workspacePath,
      projectName: 'x',
    });

    await WorkspaceDetectorService.detectAndRegisterWorkspace(workspacePath);

    expect(writeSettings).not.toHaveBeenCalled();
  });

  it('falls back to the workspace path when detection returns no project path', async () => {
    scaffoldStandardCustomRoot(workspacePath);
    detectOperatorProject.mockResolvedValue({
      isOperatorProject: true,
      projectType: OperatorProjectType.STANDARD_CUSTOM,
      projectName: 'x',
    });

    await WorkspaceDetectorService.detectAndRegisterWorkspace(workspacePath);

    expect(writeSettings)
      .toHaveBeenCalledWith({ projectType: 'ascend' }, workspacePath);
    expect(fs.existsSync(path.join(workspacePath, '.vscode', 'cache.json')))
      .toBe(true);
  });

  it('normalizes a root-level path as its own registration key', async () => {
    detectOperatorProject.mockResolvedValue({
      isOperatorProject: false,
      projectPath: '/',
      projectName: '/',
    });

    await WorkspaceDetectorService.detectAndRegisterWorkspace('/');

    expect(detectOperatorProject)
      .toHaveBeenCalledWith('/');
    expect(writeSettings).not.toHaveBeenCalled();
  });

  it('ignores a failure to scan the experimental directory', async () => {
    scaffoldStandardCustomRoot(workspacePath);
    const experimentalDir = path.join(workspacePath, 'experimental');

    mockReaddirSync.mockImplementation(((dirPath: unknown, options?: unknown) => {
      if (dirPath === experimentalDir) {
        throw new Error('boom');
      }

      return (realFs.readdirSync as (...args: unknown[])=> unknown)(dirPath, options);
    }) as never);

    await WorkspaceDetectorService.detectAndRegisterWorkspace(workspacePath);

    mockReaddirSync.mockImplementation(((...args: unknown[]) =>
      (realFs.readdirSync as (...a: unknown[])=> unknown)(...args)) as never);
    const cache = readCache(workspacePath);

    expect(cache.folders[rootKey].opsMeet)
      .toContainEqual({
        name: 'math',
        path: path.join(workspacePath, 'math'),
      });
    expect(cache.folders[rootKey].opsMeet.some((m) => m.name.startsWith('experimental')))
      .toBe(false);
  });

  it('ignores a failure to scan a single collection', async () => {
    scaffoldStandardCustomRoot(workspacePath);
    const mathDir = path.join(workspacePath, 'math');

    mockReaddirSync.mockImplementation(((dirPath: unknown, options?: unknown) => {
      if (dirPath === mathDir) {
        throw new Error('boom');
      }

      return (realFs.readdirSync as (...args: unknown[])=> unknown)(dirPath, options);
    }) as never);

    await WorkspaceDetectorService.detectAndRegisterWorkspace(workspacePath);

    mockReaddirSync.mockImplementation(((...args: unknown[]) =>
      (realFs.readdirSync as (...a: unknown[])=> unknown)(...args)) as never);
    const cache = readCache(workspacePath);

    expect(cache.folders[rootKey].opsMeet)
      .toContainEqual({
        name: 'objdetect',
        path: path.join(workspacePath, 'objdetect'),
      });
    expect(cache.folders[rootKey].opsList.some((o) => o.name === 'add'))
      .toBe(false);
  });
});

describe('WorkspaceDetectorService registration flight', () => {
  let workspacePath: string;

  beforeEach(() => {
    jest.clearAllMocks();
    resetWorkspaceCacheChainsForTest();
    workspacePath = mkTmp();
    getProjectByPathMock.mockReturnValue(undefined);
    detectOperatorProject.mockResolvedValue({
      isOperatorProject: false,
      projectPath: workspacePath,
      projectName: path.basename(workspacePath),
    });
  });

  it('whenRegistrationReady waits for an in-flight registration', async () => {
    let releaseDetection!: (value: unknown)=> void;

    detectOperatorProject.mockImplementation(() => new Promise((resolve) => {
      releaseDetection = resolve;
    }));

    const registration = WorkspaceDetectorService.detectAndRegisterWorkspace(workspacePath);
    let ready = false;

    const readyPromise = WorkspaceDetectorService.whenRegistrationReady(workspacePath)
      .then(() => {
        ready = true;
      });

    await Promise.resolve();
    expect(ready)
      .toBe(false);

    releaseDetection({
      isOperatorProject: false,
      projectPath: workspacePath,
      projectName: path.basename(workspacePath),
    });
    await registration;
    await readyPromise;
    expect(ready)
      .toBe(true);
  });

  it('whenRegistrationReady resolves immediately when nothing is pending', async () => {
    await expect(WorkspaceDetectorService.whenRegistrationReady(workspacePath))
      .resolves.toBeUndefined();
  });

  it('joins an in-flight registration instead of scanning twice', async () => {
    let releaseDetection!: (value: unknown)=> void;

    detectOperatorProject.mockImplementation(() => new Promise((resolve) => {
      releaseDetection = resolve;
    }));

    const first = WorkspaceDetectorService.detectAndRegisterWorkspace(workspacePath);
    const second = WorkspaceDetectorService.detectAndRegisterWorkspace(workspacePath);

    await Promise.resolve();
    expect(detectOperatorProject)
      .toHaveBeenCalledTimes(1);

    releaseDetection({
      isOperatorProject: false,
      projectPath: workspacePath,
      projectName: path.basename(workspacePath),
    });
    await first;
    await second;
    expect(detectOperatorProject)
      .toHaveBeenCalledTimes(1);
  });
});
