import fs from 'fs-extra';
import os from 'os';
import path from 'path';

import {
  shouldReplacePythonInterpreterTarget,
  shouldReplacePythonScriptArg,
  updateMsdebugPythonTarget,
} from '@plugin/domain/utils/debug-python-target';

describe('shouldReplacePythonInterpreterTarget', () => {
  it('replaces default placeholder interpreters', () => {
    expect(shouldReplacePythonInterpreterTarget('/usr/local/bin/python', '/tmp/ws'))
      .toBe(true);
  });
});

describe('shouldReplacePythonScriptArg', () => {
  it('replaces template script placeholders', () => {
    expect(shouldReplacePythonScriptArg('${workspaceFolder}/op.py', '/tmp/ws'))
      .toBe(true);
  });

  it('keeps an existing script path', () => {
    const ws = '/tmp/ws';
    const script = path.join(ws, 'custom.py');

    fs.ensureDirSync(ws);
    fs.writeFileSync(script, 'print("x")');

    expect(shouldReplacePythonScriptArg(script, ws))
      .toBe(false);
  });
});

describe('updateMsdebugPythonTarget', () => {
  let workspaceRoot: string;
  let launchJsonPath: string;

  beforeEach(async () => {
    workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'msdebug-py-patch-'));
    const ideDir = path.join(workspaceRoot, '.vscode');

    await fs.ensureDir(ideDir);
    launchJsonPath = path.join(ideDir, 'launch.json');
    await fs.writeFile(launchJsonPath, JSON.stringify({
      configurations: [
        {
          name: 'msdebug-triton-npu',
          type: 'msdebug-mi',
          target: '/usr/bin/python3',
          targetArgs: ['${workspaceFolder}/op.py'],
          cwd: '${workspaceRoot}',
        },
      ],
    }, null, 2));
  });

  afterEach(async () => {
    await fs.remove(workspaceRoot);
  });

  it('patches interpreter, script args, cwd, and LAUNCH_KERNEL_PATH', async () => {
    await updateMsdebugPythonTarget(workspaceRoot, ['msdebug-triton-npu'], {
      interpreter: '/opt/python3',
      scriptArg: './vector_add.py',
      cwd: '/tmp/op',
      launchKernelPath: '/home/user/.triton/cache/hash/kernel.o',
    });

    const parsed = JSON.parse(await fs.readFile(launchJsonPath, 'utf-8'));
    const cfg = parsed.configurations[0];

    expect(cfg.target)
      .toBe('/opt/python3');
    expect(cfg.targetArgs)
      .toEqual(['./vector_add.py']);
    expect(cfg.cwd)
      .toBe('/tmp/op');
    expect(cfg.environment)
      .toEqual([
        {
          name: 'LAUNCH_KERNEL_PATH',
          value: '/home/user/.triton/cache/hash/kernel.o',
        },
      ]);
  });
});
