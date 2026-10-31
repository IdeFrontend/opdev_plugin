/**
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 * This program is free software, you can redistribute it and/or modify it under the terms and conditions of
 * CANN Open Software License Agreement Version 2.0 (the "License").
 * Please refer to the License for details. You may not use this file except in compliance with the License.
 * THIS SOFTWARE IS PROVIDED ON AN "AS IS" BASIS, WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED,
 * INCLUDING BUT NOT LIMITED TO NON-INFRINGEMENT, MERCHANTABILITY, OR FITNESS FOR A PARTICULAR PURPOSE.
 * See LICENSE in the root of the software repository for the full text of the License.
 */
import * as os from 'os';
import * as path from 'path';

const mockAppendLog = jest.fn();
const mockStat = jest.fn();
const mockReadFile = jest.fn();
const mockFindFiles = jest.fn(async () => [] as Array<{ fsPath: string }>);
let mockWorkspaceFolders: Array<{ uri: { fsPath: string } }> | undefined;

jest.mock('@plugin/helpers/output-channel', () => ({ appendLog: mockAppendLog }));

jest.mock('vscode', () => {
  const pathModule = jest.requireActual<typeof import('path')>('path');

  return {
    FileType: {
      Unknown: 0,
      File: 1,
      Directory: 2,
      SymbolicLink: 64,
    },
    Uri: {
      file: (fsPath: string) => ({
        fsPath,
        toString: () => `file://${fsPath}`,
      }),
      joinPath: (base: { fsPath: string }, ...segments: string[]) => ({
        fsPath: pathModule.join(base.fsPath, ...segments),
        toString: () => `file://${pathModule.join(base.fsPath, ...segments)}`,
      }),
    },
    RelativePattern: jest.fn(function RelativePattern(
      this: { base: unknown;
        pattern: string },
      base: unknown,
      pattern: string,
    ) {
      this.base = base;
      this.pattern = pattern;
    }),
    workspace: {
      get workspaceFolders() {
        return mockWorkspaceFolders;
      },
      fs: {
        stat: (...args: unknown[]) => mockStat(...args),
        readFile: (...args: unknown[]) => mockReadFile(...args),
      },
      findFiles: (...args: unknown[]) => mockFindFiles(...args),
    },
  };
}, { virtual: true });

import {
  escapeGlobPattern,
  isPathUnderRoot,
  resolveProfilingSourceFile,
} from '@plugin/helpers/resolve-profiling-source-file';

describe('isPathUnderRoot', () => {
  it('accepts files under the root and rejects siblings / parents', () => {
    const root = path.join(os.tmpdir(), 'allow-root');

    expect(isPathUnderRoot(path.join(root, 'a.asc'), root))
      .toBe(true);
    expect(isPathUnderRoot(path.join(root, 'nested', 'a.asc'), root))
      .toBe(true);
    expect(isPathUnderRoot(path.join(root, '..', 'outside.asc'), root))
      .toBe(false);
    expect(isPathUnderRoot(path.join(os.tmpdir(), 'other', 'a.asc'), root))
      .toBe(false);
  });
});

describe('escapeGlobPattern', () => {
  it('escapes glob specials in a basename', () => {
    expect(escapeGlobPattern('kernel.cpp'))
      .toBe('kernel.cpp');
    expect(escapeGlobPattern('kernel[0]*.cpp'))
      .toBe('kernel\\[0\\]\\*.cpp');
  });
});

describe('resolveProfilingSourceFile', () => {
  const workspaceRoot = path.join(os.tmpdir(), 'ws-root');
  const reportDir = path.join(os.tmpdir(), 'report-dir');
  const reportPath = path.join(reportDir, 'result1.npu-rep');

  beforeEach(() => {
    jest.clearAllMocks();
    mockWorkspaceFolders = [{ uri: { fsPath: workspaceRoot } }];
    mockFindFiles.mockResolvedValue([]);
    mockStat.mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'FileNotFound' }));
    mockReadFile.mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'FileNotFound' }));
  });

  function mockFile(fsPath: string, contents: string): void {
    mockStat.mockImplementation(async (uri: { fsPath: string }) => {
      if (uri.fsPath === fsPath) {
        return { type: 1 };
      }

      throw Object.assign(new Error('ENOENT'), { code: 'FileNotFound' });
    });
    mockReadFile.mockImplementation(async (uri: { fsPath: string }) => {
      if (uri.fsPath === fsPath) {
        return new TextEncoder()
          .encode(contents);
      }

      throw Object.assign(new Error('ENOENT'), { code: 'FileNotFound' });
    });
  }

  it('reads an absolute fileName when it sits under the workspace allowlist', async () => {
    const abs = path.join(workspaceRoot, 'kernels', 'gather_2d.asc');

    mockFile(abs, 'kernel void gather_2d() {}');

    await expect(resolveProfilingSourceFile(
      {
        fileName: abs,
        basename: 'gather_2d.asc',
      },
      { reportPath },
    )).resolves.toBe('kernel void gather_2d() {}');
    expect(mockAppendLog)
      .toHaveBeenCalledWith(
        'profilingReport/resolveSource',
        'resolved',
        expect.objectContaining({ fileName: abs }),
      );
  });

  it('rejects an absolute fileName outside the allowlist even when it exists on disk', async () => {
    const outside = path.join(os.tmpdir(), 'outside-build', 'gather_2d.asc');

    mockFile(outside, 'should-not-read');

    await expect(resolveProfilingSourceFile(
      {
        fileName: outside,
        basename: 'gather_2d.asc',
      },
      { reportPath },
    )).resolves.toBeNull();
    expect(mockReadFile).not.toHaveBeenCalled();
    expect(mockAppendLog)
      .toHaveBeenCalledWith(
        'profilingReport/resolveSource',
        'miss',
        expect.objectContaining({ tried: expect.arrayContaining([`miss(outside-allowlist):${outside}`]) }),
      );
  });

  it('falls back to a basename search under the workspace', async () => {
    const found = path.join(workspaceRoot, 'src', 'gather_2d.asc');

    mockFindFiles.mockResolvedValueOnce([{ fsPath: found }]);
    mockFile(found, '// from workspace');

    await expect(resolveProfilingSourceFile(
      {
        fileName: '/build/out/gather_2d.asc',
        basename: 'gather_2d.asc',
      },
      { reportPath },
    )).resolves.toBe('// from workspace');
  });

  it('falls back to the report directory when the workspace has no match', async () => {
    const besideReport = path.join(reportDir, 'gather_2d.asc');

    mockFindFiles
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ fsPath: besideReport }]);
    mockFile(besideReport, '// beside report');

    await expect(resolveProfilingSourceFile(
      {
        fileName: '/build/out/gather_2d.asc',
        basename: 'gather_2d.asc',
      },
      { reportPath },
    )).resolves.toBe('// beside report');
  });

  it('returns null when nothing matches', async () => {
    await expect(resolveProfilingSourceFile(
      {
        fileName: '/build/out/missing.asc',
        basename: 'missing.asc',
      },
      { reportPath },
    )).resolves.toBeNull();
    expect(mockAppendLog)
      .toHaveBeenCalledWith(
        'profilingReport/resolveSource',
        'miss',
        expect.objectContaining({ basename: 'missing.asc' }),
      );
  });

  it('reads an absolute path under the report directory allowlist', async () => {
    const besideReport = path.join(reportDir, 'kernel.asc');

    mockFile(besideReport, '// report-dir absolute');

    await expect(resolveProfilingSourceFile(
      {
        fileName: besideReport,
        basename: 'kernel.asc',
      },
      { reportPath },
    )).resolves.toBe('// report-dir absolute');
  });
});
