/**
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 * This program is free software, you can redistribute it and/or modify it under the terms and conditions of
 * CANN Open Software License Agreement Version 2.0 (the "License").
 * Please refer to the License for details. You may not use this file except in compliance with the License.
 * THIS SOFTWARE IS PROVIDED ON AN "AS IS" BASIS, WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED,
 * INCLUDING BUT NOT LIMITED TO NON-INFRINGEMENT, MERCHANTABILITY, OR FITNESS FOR A PARTICULAR PURPOSE.
 * See LICENSE in the root of the software repository for the full text of the License.
 */
jest.mock(
  'vscode',
  () => ({
    workspace: {
      workspaceFolders: [],
      getConfiguration: jest.fn(),
    },
  }),
  { virtual: true },
);

jest.mock('@plugin/domain/services/command-strategy/pyasc-strategy', () => ({ PyAscCommandStrategy: class PyAscCommandStrategy {} }));

import { PyAscPlugin } from '@plugin/domain/plugins/pyasc.plugin';
import type { OpRecord } from '@plugin/domain/models/op-record';

describe('PyAscPlugin', () => {
  const plugin = new PyAscPlugin();

  const op = {
    id: 1,
    project_id: 10,
    op_name: 'pyasc_temple',
    op_type: 'pyasc',
    op_path: '/tmp/pyasc_project',
  } as OpRecord;

  it('getInitialConfigScripts uses python3 entry without build.sh', () => {
    const scripts = plugin.getInitialConfigScripts(op, '/tmp/pyasc_project');

    expect(scripts.buildScript)
      .toBe('python3 ./pyasc_temple.py');
    expect(scripts.simulateScript)
      .toBe('python3 ./pyasc_temple.py');
    expect(scripts.onBoardScript)
      .toBe('python3 ./pyasc_temple.py');
    expect(Object.values(scripts)
      .every((s) => !s.includes('build.sh')))
      .toBe(true);
  });

  it('getDefaultPaths points script paths at the operator .py file', () => {
    const paths = plugin.getDefaultPaths(op);

    expect(paths.opScriptPath)
      .toContain('pyasc_temple.py');
    expect(paths.targetOpFile)
      .toBe('python3 ./pyasc_temple.py');
  });
});
