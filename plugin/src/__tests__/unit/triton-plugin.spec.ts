import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { TritonPlugin } from '@plugin/domain/plugins/triton.plugin';
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

jest.mock('@plugin/domain/services/op-generator-factory', () => ({
  BaseOpGenerator: class BaseOpGenerator {},
  AscendOpGenerator: jest.fn(),
  TritonOpGenerator: jest.fn(),
  CannOpGenerator: jest.fn(),
  PyAscOpGenerator: jest.fn(),
}));

describe('TritonPlugin project detection', () => {
  let tempRoot: string;

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'triton-detect-'));
  });

  afterEach(() => {
    fs.rmSync(tempRoot, {
      recursive: true,
      force: true,
    });
    jest.clearAllMocks();
  });

  it('matches a root Python entry importing triton without CMakeLists', async () => {
    fs.writeFileSync(path.join(tempRoot, 'vector_add.py'), 'import triton\n');

    await expect(new TritonPlugin()
      .detectProject(tempRoot))
      .resolves
      .toEqual({
        isMatch: true,
        confidence: 'heuristic',
      });
  });

  it('matches triton markers in a nested Python file up to two levels deep', async () => {
    const nested = path.join(tempRoot, 'ops', 'kernels');

    fs.mkdirSync(nested, { recursive: true });
    fs.writeFileSync(path.join(nested, 'kernel.py'), 'from triton import language\n');

    await expect(new TritonPlugin()
      .detectProject(tempRoot))
      .resolves
      .toEqual(expect.objectContaining({ isMatch: true }));
  });

  it('does not match when CMakeLists.txt is present', async () => {
    fs.writeFileSync(path.join(tempRoot, 'CMakeLists.txt'), '');
    fs.writeFileSync(path.join(tempRoot, 'vector_add.py'), 'import triton\n');

    await expect(new TritonPlugin()
      .detectProject(tempRoot))
      .resolves
      .toEqual(expect.objectContaining({ isMatch: false }));
  });

  it('does not match Python files without triton indicators', async () => {
    fs.writeFileSync(path.join(tempRoot, 'plain.py'), 'print(1)\n');

    await expect(new TritonPlugin()
      .detectProject(tempRoot))
      .resolves
      .toEqual(expect.objectContaining({ isMatch: false }));
  });

  it('does not match a directory without Python files', async () => {
    fs.writeFileSync(path.join(tempRoot, 'CMakeLists.txt'), '');

    await expect(new TritonPlugin()
      .detectProject(tempRoot))
      .resolves
      .toEqual(expect.objectContaining({ isMatch: false }));
  });

  it('ignores triton markers deeper than the two-level scan limit', async () => {
    const deep = path.join(tempRoot, 'a', 'b', 'c');

    fs.mkdirSync(deep, { recursive: true });
    fs.writeFileSync(path.join(deep, 'deep.py'), 'import triton\n');

    await expect(new TritonPlugin()
      .detectProject(tempRoot))
      .resolves
      .toEqual(expect.objectContaining({ isMatch: false }));
  });
});

describe('TritonPlugin defaults and generation', () => {
  const plugin = new TritonPlugin();
  const op = {
    id: 1,
    project_id: 1,
    op_name: 'vector_add',
    op_type: 'triton',
    op_path: path.join('repo', 'ops', 'vector_add'),
  } as OpRecord;

  it('exposes the triton op type, display name, and build behavior', () => {
    expect(plugin.opType)
      .toBe('triton');
    expect(plugin.displayName)
      .toBe('Triton');
    expect(plugin.buildBehavior)
      .toEqual(expect.objectContaining({
        requiresBuildBeforeAnalysis: false,
        requiresActiveFileCheck: true,
        activeFileExtension: '.py',
        supportsCpuDebug: false,
        supportsNpuDebug: false,
        supportsNpuPythonDebug: true,
      }));
  });

  it('points the default paths at the python entry', () => {
    expect(plugin.getDefaultPaths(op))
      .toEqual({
        opScriptPath:      path.join(op.op_path, 'build.sh'),
        exampleScriptPath: path.join(op.op_path, 'build.sh'),
        targetDir:         path.resolve(op.op_path, 'build_out'),
        targetOpFile:      `python3 ./${op.op_name}.py`,
        targetExampleFile: `python3 ./${op.op_name}.py`,
      });
  });

  it('uses the python entry for every config script and a debug variant for NPU debug', () => {
    const scripts = plugin.getInitialConfigScripts(op, '/workspace');
    const py = `python3 ./${op.op_name}.py`;

    expect(scripts)
      .toEqual({
        buildScript:     py,
        exampleScript:   py,
        simulateScript:  py,
        onBoardScript:   py,
        sanitizerScript: py,
        cpuDebugScript:  py,
        npuDebugScript:  expect.stringContaining(py),
        utTestScript:    py,
      });
    expect(scripts.npuDebugScript)
      .toContain('TRITON_DISABLE_CACHE=1');
    expect(scripts.npuDebugScript)
      .toContain('.triton_launch_kernel_path');
  });

  it('defaults the template name for an unspecified Triton generator', () => {
    const { TritonOpGenerator } = jest.requireMock('@plugin/domain/services/op-generator-factory') as {
      TritonOpGenerator: jest.Mock;
    };
    const params = {
      op_path: '/some/op',
      op_name: 'vector_add',
    };
    const project = { project_path: '/some/op' };

    const generator = plugin.createProjectGenerator(params, project, '/ext');

    expect(TritonOpGenerator)
      .toHaveBeenCalledWith(
        {
          ...params,
          template_name: 'triton_vector_add',
        },
        project,
        '/ext',
      );
    expect(generator)
      .toBeInstanceOf(TritonOpGenerator);
  });

  it('keeps an explicit template name when creating the generator', () => {
    const { TritonOpGenerator } = jest.requireMock('@plugin/domain/services/op-generator-factory') as {
      TritonOpGenerator: jest.Mock;
    };
    const params = {
      op_path: '/some/op',
      op_name: 'vector_add',
      template_name: 'custom_triton',
    };

    plugin.createProjectGenerator(params, { project_path: '/some/op' }, '/ext');

    expect(TritonOpGenerator)
      .toHaveBeenCalledWith(
        expect.objectContaining({ template_name: 'custom_triton' }),
        expect.anything(),
        '/ext',
      );
  });
});
