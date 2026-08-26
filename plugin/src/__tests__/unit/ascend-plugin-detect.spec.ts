import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { AscendPlugin } from '@plugin/domain/plugins/ascend.plugin';
import type { OpRecord } from '@plugin/domain/models/op-record';

jest.mock('vscode', () => ({
  env: { uriScheme: 'vscode' },
  workspace: {
    workspaceFolders: [],
    getConfiguration: jest.fn(() => ({
      inspect: jest.fn(),
      get: jest.fn(),
      update: jest.fn(),
    })),
  },
}));

jest.mock('@plugin/domain/utils/build-utils', () => ({ checkBuildShHasBishengConfig: jest.fn(() => false) }));

jest.mock('@plugin/domain/utils/ascend-util', () => ({ patchAclnnCmakeSupportVars: jest.fn() }));

jest.mock('@plugin/domain/services/op-generator-factory', () => ({
  BaseOpGenerator: class BaseOpGenerator {},
  AscendOpGenerator: jest.fn(),
  TritonOpGenerator: jest.fn(),
  CannOpGenerator: jest.fn(),
  PyAscOpGenerator: jest.fn(),
}));

describe('AscendPlugin project detection', () => {
  let tempRoot: string;

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ascend-detect-'));
  });

  afterEach(() => {
    fs.rmSync(tempRoot, {
      recursive: true,
      force: true,
    });
    jest.clearAllMocks();
  });

  it('matches a CMake project with .asc files and no root Python entry', async () => {
    fs.writeFileSync(path.join(tempRoot, 'CMakeLists.txt'), '');
    fs.writeFileSync(path.join(tempRoot, 'add_custom.asc'), '');

    await expect(new AscendPlugin()
      .detectProject(tempRoot))
      .resolves
      .toEqual({
        isMatch: true,
        confidence: 'heuristic',
      });
  });

  it('finds .asc files nested up to two levels deep', async () => {
    const nested = path.join(tempRoot, 'src');

    fs.writeFileSync(path.join(tempRoot, 'CMakeLists.txt'), '');
    fs.mkdirSync(nested);
    fs.writeFileSync(path.join(nested, 'kernel.asc'), '');

    await expect(new AscendPlugin()
      .detectProject(tempRoot))
      .resolves
      .toEqual(expect.objectContaining({ isMatch: true }));
  });

  it('does not match a project with a root Python entry', async () => {
    fs.writeFileSync(path.join(tempRoot, 'CMakeLists.txt'), '');
    fs.writeFileSync(path.join(tempRoot, 'add_custom.asc'), '');
    fs.writeFileSync(path.join(tempRoot, 'main.py'), '');

    await expect(new AscendPlugin()
      .detectProject(tempRoot))
      .resolves
      .toEqual(expect.objectContaining({ isMatch: false }));
  });

  it('does not match without CMakeLists.txt even when .asc files exist', async () => {
    fs.writeFileSync(path.join(tempRoot, 'add_custom.asc'), '');

    await expect(new AscendPlugin()
      .detectProject(tempRoot))
      .resolves
      .toEqual(expect.objectContaining({ isMatch: false }));
  });

  it('does not match a CMake project without .asc files', async () => {
    fs.writeFileSync(path.join(tempRoot, 'CMakeLists.txt'), '');
    fs.writeFileSync(path.join(tempRoot, 'main.py'), '');

    await expect(new AscendPlugin()
      .detectProject(tempRoot))
      .resolves
      .toEqual(expect.objectContaining({ isMatch: false }));
  });

  it('exposes the ascend op type, display name, and project mappings', () => {
    const plugin = new AscendPlugin();

    expect(plugin.opType)
      .toBe('ascend');
    expect(plugin.displayName)
      .toBe('Ascend C');
    expect(plugin.buildBehavior.supportsNpuPythonDebug)
      .toBe(true);
  });

  it('returns the run-package default paths', () => {
    const op = {
      id: 1,
      project_id: 1,
      op_name: 'add',
      op_type: 'ascend',
      op_path: path.join('repo', 'math', 'add'),
    } as OpRecord;
    const paths = new AscendPlugin()
      .getDefaultPaths(op);

    expect(paths)
      .toEqual({
        opScriptPath:      path.join(op.op_path, 'build.sh'),
        exampleScriptPath: path.join(op.op_path, 'build.sh'),
        targetDir:         path.resolve(op.op_path, 'build_out'),
        targetOpFile:      path.join(op.op_path, 'build_out', '*.run'),
        targetExampleFile: path.join(op.op_path, 'build', 'test_aclnn_add'),
      });
  });

  it('patches aclnn cmake support vars with the requested SOC version', () => {
    const patchAclnnCmakeSupportVars = jest.requireMock('@plugin/domain/utils/ascend-util')
      .patchAclnnCmakeSupportVars as jest.Mock;
    const params = { soc_version: 'ascend910b' };

    new AscendPlugin()
      .patchGeneratedProject('/some/op', params);

    expect(patchAclnnCmakeSupportVars)
      .toHaveBeenCalledWith('/some/op', 'ascend910b');
  });

  it('creates an AscendOpGenerator with the given params, project, and extension path', () => {
    const { AscendOpGenerator } = jest.requireMock('@plugin/domain/services/op-generator-factory') as {
      AscendOpGenerator: jest.Mock;
    };
    const plugin = new AscendPlugin();
    const params = {
      op_path: '/some/op',
      op_name: 'add',
    };
    const project = { project_path: '/some/op' };

    const generator = plugin.createProjectGenerator(params, project, '/ext');

    expect(AscendOpGenerator)
      .toHaveBeenCalledWith(params, project, '/ext');
    expect(generator)
      .toBeInstanceOf(AscendOpGenerator);
  });
});
