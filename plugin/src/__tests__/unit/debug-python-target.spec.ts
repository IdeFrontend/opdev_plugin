/**
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 * This program is free software, you can redistribute it and/or modify it under the terms and conditions of
 * CANN Open Software License Agreement Version 2.0 (the "License").
 * Please refer to the License for details. You may not use this file except in compliance with the License.
 * THIS SOFTWARE IS PROVIDED ON AN "AS IS" BASIS, WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED,
 * INCLUDING BUT NOT LIMITED TO NON-INFRINGEMENT, MERCHANTABILITY, OR FITNESS FOR A PARTICULAR PURPOSE.
 * See LICENSE in the root of the software repository for the full text of the License.
 */
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
    expect(shouldReplacePythonInterpreterTarget('/usr/bin/python3', '/tmp/ws'))
      .toBe(true);
    expect(shouldReplacePythonInterpreterTarget('/usr/bin/python', '/tmp/ws'))
      .toBe(true);
  });

  it('replaces an undefined interpreter', () => {
    expect(shouldReplacePythonInterpreterTarget(undefined, '/tmp/ws'))
      .toBe(true);
  });

  it('replaces an interpreter path that does not exist on disk', () => {
    expect(shouldReplacePythonInterpreterTarget('/opt/missing/python', '/tmp/ws'))
      .toBe(true);
  });

  it('keeps an existing interpreter path', () => {
    const ws = fs.mkdtempSync(path.join(os.tmpdir(), 'msdebug-py-int-'));
    const interpreter = path.join(ws, 'python');

    fs.writeFileSync(interpreter, '#!/bin/sh');

    try {
      expect(shouldReplacePythonInterpreterTarget(interpreter, ws))
        .toBe(false);
    }
    finally {
      fs.removeSync(ws);
    }
  });
});

describe('shouldReplacePythonScriptArg', () => {
  it('replaces template script placeholders', () => {
    expect(shouldReplacePythonScriptArg('${workspaceFolder}/op.py', '/tmp/ws'))
      .toBe(true);
  });

  it('replaces ${workspaceFolderBasename} and ${workspaceRoot} variants', () => {
    expect(shouldReplacePythonScriptArg('${workspaceFolderBasename}/run.py', '/tmp/ws'))
      .toBe(true);
    expect(shouldReplacePythonScriptArg('${workspaceRoot}/op.py', '/tmp/ws'))
      .toBe(true);
  });

  it('replaces an undefined script arg', () => {
    expect(shouldReplacePythonScriptArg(undefined, '/tmp/ws'))
      .toBe(true);
  });

  it('replaces a script path that does not exist on disk', () => {
    expect(shouldReplacePythonScriptArg('/no/such/op.py', '/tmp/ws'))
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

  it('returns silently when launch.json is missing', async () => {
    await fs.remove(launchJsonPath);

    await expect(updateMsdebugPythonTarget(workspaceRoot, ['msdebug-triton-npu'], {
      interpreter: '/opt/python3',
      scriptArg: './vector_add.py',
    }))
      .resolves
      .toBeUndefined();
  });

  it('returns silently when no config names are requested', async () => {
    await expect(updateMsdebugPythonTarget(workspaceRoot, [], {
      interpreter: '/opt/python3',
      scriptArg: './vector_add.py',
    }))
      .resolves
      .toBeUndefined();
  });

  it('returns silently when launch.json is not valid JSON', async () => {
    await fs.writeFile(launchJsonPath, '{not json');

    await expect(updateMsdebugPythonTarget(workspaceRoot, ['msdebug-triton-npu'], {
      interpreter: '/opt/python3',
      scriptArg: './vector_add.py',
    }))
      .resolves
      .toBeUndefined();
  });

  it('returns silently when configurations is not an array', async () => {
    await fs.writeFile(launchJsonPath, JSON.stringify({ configurations: { a: 1 } }));

    await expect(updateMsdebugPythonTarget(workspaceRoot, ['msdebug-triton-npu'], {
      interpreter: '/opt/python3',
      scriptArg: './vector_add.py',
    }))
      .resolves
      .toBeUndefined();
  });

  it('skips configurations whose name is not in the requested set', async () => {
    await updateMsdebugPythonTarget(workspaceRoot, ['msdebug-python'], {
      interpreter: '/opt/python3',
      scriptArg: './vector_add.py',
    });

    const parsed = JSON.parse(await fs.readFile(launchJsonPath, 'utf-8'));

    expect(parsed.configurations[0].target)
      .toBe('/usr/bin/python3');
    expect(parsed.configurations[0].targetArgs)
      .toEqual(['${workspaceFolder}/op.py']);
  });

  it('replaces a non-string target and filters non-string targetArgs', async () => {
    await fs.writeFile(launchJsonPath, JSON.stringify({
      configurations: [
        {
          name: 'msdebug-triton-npu',
          target: 12345,
          targetArgs: [
            '${workspaceFolder}/op.py',
            42,
            '-u',
          ],
        },
      ],
    }));

    await updateMsdebugPythonTarget(workspaceRoot, ['msdebug-triton-npu'], {
      interpreter: '/opt/python3',
      scriptArg: './vector_add.py',
    });

    const parsed = JSON.parse(await fs.readFile(launchJsonPath, 'utf-8'));

    expect(parsed.configurations[0].target)
      .toBe('/opt/python3');
    expect(parsed.configurations[0].targetArgs)
      .toEqual([
        './vector_add.py',
        '-u',
      ]);
  });

  it('replaces the whole arg list when targetArgs is not an array', async () => {
    await fs.writeFile(launchJsonPath, JSON.stringify({
      configurations: [
        {
          name: 'msdebug-triton-npu',
          target: '/usr/bin/python3',
          targetArgs: 'not-an-array',
        },
      ],
    }));

    await updateMsdebugPythonTarget(workspaceRoot, ['msdebug-triton-npu'], {
      interpreter: '/opt/python3',
      scriptArg: './vector_add.py',
    });

    const parsed = JSON.parse(await fs.readFile(launchJsonPath, 'utf-8'));

    expect(parsed.configurations[0].targetArgs)
      .toEqual(['./vector_add.py']);
  });

  it('skips configurations with a non-string name', async () => {
    await fs.writeFile(launchJsonPath, JSON.stringify({
      configurations: [
        {
          name: 12345,
          target: '/usr/bin/python3',
          targetArgs: ['${workspaceFolder}/op.py'],
        },
      ],
    }));

    await updateMsdebugPythonTarget(workspaceRoot, ['msdebug-triton-npu'], {
      interpreter: '/opt/python3',
      scriptArg: './vector_add.py',
    });

    const parsed = JSON.parse(await fs.readFile(launchJsonPath, 'utf-8'));

    expect(parsed.configurations[0].target)
      .toBe('/usr/bin/python3');
    expect(parsed.configurations[0].targetArgs)
      .toEqual(['${workspaceFolder}/op.py']);
  });

  it('replaces an existing LAUNCH_KERNEL_PATH without duplicating it', async () => {
    await fs.writeFile(launchJsonPath, JSON.stringify({
      configurations: [
        {
          name: 'msdebug-triton-npu',
          target: '/usr/bin/python3',
          targetArgs: ['${workspaceFolder}/op.py'],
          environment: [
            {
              name: 'LAUNCH_KERNEL_PATH',
              value: '/old/kernel.o',
            },
            {
              name: 'KEEP_ME',
              value: '1',
            },
          ],
        },
      ],
    }));

    await updateMsdebugPythonTarget(workspaceRoot, ['msdebug-triton-npu'], {
      interpreter: '/opt/python3',
      scriptArg: './vector_add.py',
      launchKernelPath: '/new/kernel.o',
    });

    const parsed = JSON.parse(await fs.readFile(launchJsonPath, 'utf-8'));

    expect(parsed.configurations[0].environment)
      .toEqual([
        {
          name: 'KEEP_ME',
          value: '1',
        },
        {
          name: 'LAUNCH_KERNEL_PATH',
          value: '/new/kernel.o',
        },
      ]);
  });

  it('replaces a non-array environment and filters junk entries', async () => {
    await fs.writeFile(launchJsonPath, JSON.stringify({
      configurations: [
        {
          name: 'msdebug-triton-npu',
          target: '/usr/bin/python3',
          targetArgs: ['${workspaceFolder}/op.py'],
          environment: { not: 'an array' },
        },
      ],
    }));

    await updateMsdebugPythonTarget(workspaceRoot, ['msdebug-triton-npu'], {
      interpreter: '/opt/python3',
      scriptArg: './vector_add.py',
      launchKernelPath: '/new/kernel.o',
    });

    const parsed = JSON.parse(await fs.readFile(launchJsonPath, 'utf-8'));

    expect(parsed.configurations[0].environment)
      .toEqual([
        {
          name: 'LAUNCH_KERNEL_PATH',
          value: '/new/kernel.o',
        },
      ]);
  });

  it('leaves environment alone when launchKernelPath is not provided', async () => {
    await fs.writeFile(launchJsonPath, JSON.stringify({
      configurations: [
        {
          name: 'msdebug-triton-npu',
          target: '/usr/bin/python3',
          targetArgs: ['${workspaceFolder}/op.py'],
          environment: [
            {
              name: 'KEEP_ME',
              value: '1',
            },
          ],
        },
      ],
    }));

    await updateMsdebugPythonTarget(workspaceRoot, ['msdebug-triton-npu'], {
      interpreter: '/opt/python3',
      scriptArg: './vector_add.py',
    });

    const parsed = JSON.parse(await fs.readFile(launchJsonPath, 'utf-8'));

    expect(parsed.configurations[0].environment)
      .toEqual([
        {
          name: 'KEEP_ME',
          value: '1',
        },
      ]);
  });

  it('does not rewrite the file when nothing changes', async () => {
    const interpreter = path.join(workspaceRoot, 'existing-python');

    fs.writeFileSync(interpreter, '#!/bin/sh');
    fs.writeFileSync(path.join(workspaceRoot, 'custom.py'), 'print(1)');

    await fs.writeFile(launchJsonPath, JSON.stringify({
      configurations: [
        {
          name: 'msdebug-triton-npu',
          target: interpreter,
          targetArgs: ['${workspaceFolder}/custom.py'],
        },
      ],
    }));

    const before = await fs.readFile(launchJsonPath, 'utf-8');
    const writeSpy = jest.spyOn(fs, 'writeFile');

    await updateMsdebugPythonTarget(workspaceRoot, ['msdebug-triton-npu'], {
      interpreter,
      scriptArg: '${workspaceFolder}/custom.py',
    });

    expect(writeSpy)
      .not.toHaveBeenCalled();
    expect(await fs.readFile(launchJsonPath, 'utf-8'))
      .toBe(before);
  });
});
