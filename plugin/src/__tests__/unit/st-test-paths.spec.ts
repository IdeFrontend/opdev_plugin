/**
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 * This program is free software, you can redistribute it and/or modify it under the terms and conditions of
 * CANN Open Software License Agreement Version 2.0 (the "License").
 * Please refer to the License for details. You may not use this file except in compliance with the License.
 * THIS SOFTWARE IS PROVIDED ON AN "AS IS" BASIS, WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED,
 * INCLUDING BUT NOT LIMITED TO NON-INFRINGEMENT, MERCHANTABILITY, OR FITNESS FOR A PARTICULAR PURPOSE.
 * See LICENSE in the root of the software repository for the full text of the License.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import {
  classifyStTestInputCsv,
  createStTestRunId,
  discoverStTestInputCsvFiles,
  ensureStTestOutputDirectory,
  isPathOutside,
  resolveStTestInputDir,
  resolveStTestOperatorHistoryDirectory,
  resolveStTestOutputCsvPath,
  resolveStTestPluginDir,
  toDisplayPath,
  toSafeStTestPathSegment,
  validateStTestOperatorDirectory,
} from '@plugin/domain/utils/st-test-paths';

const KERNEL_CSV = 'testcase_name,op_name\ncase,add\n';
const ACLNN_CSV = 'testcase_name,api_name\ncase,aclnnAdd\n';
const E2E_CSV = 'testcase_name,api_name\ncase,torch.add\n';

describe('ST test path helpers', () => {
  let root: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'mstt-st-paths-'));
  });

  afterEach(() => {
    jest.restoreAllMocks();
    fs.rmSync(root, {
      recursive: true,
      force: true,
    });
  });

  it.each([
    [
      'kernel when the exact api_name header is absent',
      'testcase_name,op_name\ncase,add\n',
      'kernel',
    ],
    [
      'kernel when only a differently-cased API_NAME header exists',
      'testcase_name,API_NAME\ncase,aclnnAdd\n',
      'kernel',
    ],
    [
      'aclnn from the first non-empty trimmed API value, ignoring case',
      '\r\ntestcase_name, api_name\r\n"case, one",""\r\n"case, two"," ACLNNAdd "\r\n',
      'aclnn',
    ],
    [
      'aclnn after applying Python-only whitespace stripping',
      'testcase_name,\u0085api_name\u0085\ncase,\u001cACLNNAdd\u001f\n',
      'aclnn',
    ],
    [
      'e2e from the first non-empty non-aclnn API value',
      'testcase_name,api_name\ncase,torch.add\n',
      'e2e',
    ],
    [
      'kernel when a UTF-8 BOM prefixes the first api_name header',
      '\uFEFFapi_name\naclnnAdd\n',
      'kernel',
    ],
    [
      'aclnn when a header-only api_name column has no non-empty values',
      'testcase_name,api_name\n',
      'aclnn',
    ],
  ] as const)('classifies %s', (_scenario, csv, expectedMode) => {
    expect(classifyStTestInputCsv(csv, 'input.csv'))
      .toBe(expectedMode);
  });

  it('discovers arbitrary lowercase CSV names by content in deterministic per-mode order', () => {
    const inputDir = resolveStTestInputDir(root);

    fs.mkdirSync(inputDir, { recursive: true });
    fs.writeFileSync(path.join(inputDir, 'zeta.csv'), KERNEL_CSV);
    fs.writeFileSync(path.join(inputDir, 'beta.csv'), ACLNN_CSV);
    fs.writeFileSync(path.join(inputDir, 'gamma.csv'), E2E_CSV);
    fs.writeFileSync(path.join(inputDir, 'ttk_kernel_x.csv'), E2E_CSV);

    expect(discoverStTestInputCsvFiles(root))
      .toEqual({
        kernel: [path.join(inputDir, 'zeta.csv')],
        aclnn: [path.join(inputDir, 'beta.csv')],
        e2e: [
          path.join(inputDir, 'gamma.csv'),
          path.join(inputDir, 'ttk_kernel_x.csv'),
        ],
      });
  });

  it('ignores non-input entries without searching recursively or following symlinks', () => {
    const inputDir = resolveStTestInputDir(root);
    const nestedDirectory = path.join(inputDir, 'nested');
    const symlinkTarget = path.join(inputDir, 'symlink-target');

    fs.mkdirSync(nestedDirectory, { recursive: true });
    fs.mkdirSync(symlinkTarget);
    fs.writeFileSync(path.join(inputDir, 'upper.CSV'), KERNEL_CSV);
    fs.writeFileSync(path.join(inputDir, 'notes.txt'), KERNEL_CSV);
    fs.mkdirSync(path.join(inputDir, 'directory.csv'));
    fs.writeFileSync(path.join(nestedDirectory, 'nested.csv'), KERNEL_CSV);
    fs.symlinkSync(
      symlinkTarget,
      path.join(inputDir, 'symlink.csv'),
      process.platform === 'win32' ? 'junction' : 'dir',
    );

    expect(discoverStTestInputCsvFiles(root))
      .toEqual({
        kernel: [],
        aclnn: [],
        e2e: [],
      });
  });

  it('returns empty per-mode lists when the input dir is missing', () => {
    expect(discoverStTestInputCsvFiles(root))
      .toEqual({
        kernel: [],
        aclnn: [],
        e2e: [],
      });
  });

  it('unquotes escaped quotes inside quoted fields', () => {
    expect(classifyStTestInputCsv(
      'testcase_name,api_name\n"case with ""quotes""","aclnnAdd"\n',
      'input.csv',
    ))
      .toBe('aclnn');
  });

  it('classifies a final row that lacks a trailing newline', () => {
    expect(classifyStTestInputCsv('testcase_name,api_name\ncase,aclnnAdd', 'input.csv'))
      .toBe('aclnn');
  });

  it('treats a lone carriage return as a row terminator', () => {
    expect(classifyStTestInputCsv('testcase_name,api_name\rcase,aclnnAdd\r', 'input.csv'))
      .toBe('aclnn');
  });

  it('rejects an empty lowercase CSV', () => {
    const inputDir = resolveStTestInputDir(root);

    fs.mkdirSync(inputDir, { recursive: true });
    fs.writeFileSync(path.join(inputDir, 'empty.csv'), '\r\n\n');

    expect(() => discoverStTestInputCsvFiles(root))
      .toThrow(/ST CSV file is empty:.*empty\.csv/);
  });

  it('rejects a CSV whose open fails with ELOOP', () => {
    const inputDir = resolveStTestInputDir(root);

    fs.mkdirSync(inputDir, { recursive: true });
    fs.writeFileSync(path.join(inputDir, 'loop.csv'), KERNEL_CSV);

    const mutableFs = jest.requireActual<typeof import('fs')>('fs');

    jest.spyOn(mutableFs, 'openSync')
      .mockImplementationOnce(() => {
        throw Object.assign(new Error('too many levels of symbolic links'), { code: 'ELOOP' });
      });

    expect(() => discoverStTestInputCsvFiles(root))
      .toThrow(/ST CSV input must not be a symbolic link:.*loop\.csv/);
  });

  it('propagates non-ELOOP open errors', () => {
    const inputDir = resolveStTestInputDir(root);

    fs.mkdirSync(inputDir, { recursive: true });
    fs.writeFileSync(path.join(inputDir, 'denied.csv'), KERNEL_CSV);

    const mutableFs = jest.requireActual<typeof import('fs')>('fs');

    jest.spyOn(mutableFs, 'openSync')
      .mockImplementationOnce(() => {
        throw Object.assign(new Error('permission denied'), { code: 'EACCES' });
      });

    expect(() => discoverStTestInputCsvFiles(root))
      .toThrow(/permission denied/);
  });

  it('classifies a quote that appears mid-field as a literal character', () => {
    expect(classifyStTestInputCsv('api_name\nacl"nnAdd\n', 'input.csv'))
      .toBe('e2e');
  });

  it('skips data rows shorter than the api_name column', () => {
    expect(classifyStTestInputCsv(
      'a,api_name,b\nonly_one_field\ncase,aclnnAdd,y\n',
      'input.csv',
    ))
      .toBe('aclnn');
  });

  it('rejects a CSV that is swapped while being read', () => {
    const inputDir = resolveStTestInputDir(root);

    fs.mkdirSync(inputDir, { recursive: true });
    fs.writeFileSync(path.join(inputDir, 'raced.csv'), KERNEL_CSV);

    const mutableFs = jest.requireActual<typeof import('fs')>('fs');
    const realLstat = mutableFs.lstatSync.bind(mutableFs);
    let lstatCalls = 0;

    jest.spyOn(mutableFs, 'lstatSync')
      .mockImplementation((((p: fs.PathLike) => {
        lstatCalls += 1;

        if (lstatCalls === 1) {
          return realLstat(p);
        }

        return {
          isFile: () => true,
          dev: -1,
          ino: -1,
        } as unknown as fs.Stats;
      }) as typeof fs.lstatSync));

    expect(() => discoverStTestInputCsvFiles(root))
      .toThrow(/ST CSV input changed while being read:.*raced\.csv/);
  });

  it('rejects malformed UTF-8 before classifying an input', () => {
    const inputDir = resolveStTestInputDir(root);

    fs.mkdirSync(inputDir, { recursive: true });
    fs.writeFileSync(path.join(inputDir, 'invalid.csv'), Buffer.from([
      0xff,
      0xfe,
    ]));

    expect(() => discoverStTestInputCsvFiles(root))
      .toThrow(/ST CSV file is not valid UTF-8:.*invalid\.csv/);
  });

  it('does not follow a CSV replaced by a symlink after enumeration', () => {
    const inputDir = resolveStTestInputDir(root);
    const inputPath = path.join(inputDir, 'raced.csv');
    const symlinkTarget = path.join(root, 'symlink-target');

    fs.mkdirSync(inputDir, { recursive: true });
    fs.mkdirSync(symlinkTarget);
    fs.writeFileSync(inputPath, KERNEL_CSV);
    const staleEntries = fs.readdirSync(inputDir, { withFileTypes: true });
    const mutableFs = jest.requireActual<typeof import('fs')>('fs');

    jest.spyOn(mutableFs, 'readdirSync')
      .mockImplementationOnce((() => {
        fs.rmSync(inputPath);
        fs.symlinkSync(
          symlinkTarget,
          inputPath,
          process.platform === 'win32' ? 'junction' : 'dir',
        );

        return staleEntries;
      }) as typeof fs.readdirSync);

    expect(() => discoverStTestInputCsvFiles(root))
      .toThrow();
  });

  it('propagates non-missing input-directory errors instead of reporting no files', () => {
    const inputDir = resolveStTestInputDir(root);

    fs.mkdirSync(path.dirname(inputDir), { recursive: true });
    fs.writeFileSync(inputDir, 'not a directory');

    expect(() => discoverStTestInputCsvFiles(root))
      .toThrow();
  });

  it('prefers tests/assets as the plugin path and falls back to tests', () => {
    const testsPath = path.join(root, 'tests');
    const assetsPath = path.join(testsPath, 'assets');

    expect(resolveStTestPluginDir(root))
      .toBeUndefined();

    fs.mkdirSync(testsPath);
    expect(resolveStTestPluginDir(root))
      .toBe(testsPath);

    fs.mkdirSync(assetsPath);
    expect(resolveStTestPluginDir(root))
      .toBe(assetsPath);
  });

  it('creates safe unique result paths under workspace IDE storage', () => {
    const inputPath = path.join(root, 'ttk_kernel_input;one.csv');
    const first = resolveStTestOutputCsvPath({
      workspaceRoot: root,
      operatorName: '../unsafe operator',
      mode: 'kernel',
      inputCsvPath: inputPath,
      runId: '2026:07:15/run',
      sequence: 1,
    });
    const second = resolveStTestOutputCsvPath({
      workspaceRoot: root,
      operatorName: '../unsafe operator',
      mode: 'kernel',
      inputCsvPath: inputPath,
      runId: '2026:07:15/run',
      sequence: 2,
    });

    expect(first).not.toBe(second);
    expect(path.relative(root, first))
      .toMatch(/^\.vscode[\\/]st-results[\\/]/);
    expect(path.relative(root, first))
      .not.toMatch(/^\.vscode[\\/]st-results[\\/][^\\/]+[\\/]2026/);
    expect(first).not.toContain('unsafe operator');
    expect(first).not.toContain('..');
    expect(path.basename(first))
      .toMatch(/^001-/);

    ensureStTestOutputDirectory(first);
    expect(fs.statSync(path.dirname(first))
      .isDirectory())
      .toBe(true);
  });

  it('creates stable filesystem-safe run identifiers', () => {
    expect(createStTestRunId(
      Date.UTC(2026, 6, 15, 12, 34, 56, 789),
      'fixed-entropy',
    ))
      .toBe('2026-07-15T12-34-56-789Z-fixed-entropy');
  });

  it('uses UUID entropy to distinguish runs created at the same time', () => {
    const now = Date.UTC(2026, 6, 15, 12, 34, 56, 789);

    expect(createStTestRunId(now))
      .not.toBe(createStTestRunId(now));
  });

  it('defaults to the current time and a UUID when called without arguments', () => {
    expect(createStTestRunId())
      .toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z-[a-f0-9-]+$/);
  });

  it('falls back to an underscore segment for whitespace-only values', () => {
    expect(toSafeStTestPathSegment('   '))
      .toBe('_');
    expect(toSafeStTestPathSegment('...'))
      .toBe('_');
  });

  it('builds deterministic bounded result names for long input filenames', () => {
    const params = {
      workspaceRoot: root,
      operatorName: 'operator',
      mode: 'kernel' as const,
      inputCsvPath: path.join(root, `${'very-long-input-name-'.repeat(20)}.csv`),
      runId: 'run-id',
      sequence: 7,
    };
    const first = resolveStTestOutputCsvPath(params);
    const second = resolveStTestOutputCsvPath(params);
    const fileName = path.basename(first);

    expect(first)
      .toBe(second);
    expect(fileName.length)
      .toBeLessThanOrEqual(120);
    expect(fileName)
      .toMatch(/^007-.+-[a-f0-9]{12}-result\.csv$/);
  });

  it('treats an in-workspace name beginning with two dots as inside', () => {
    expect(isPathOutside(root, path.join(root, '..custom')))
      .toBe(false);
  });

  it('detects escapes via foreign backslash separators', () => {
    expect(isPathOutside(root, path.join(root, '..') + '\\outside.csv'))
      .toBe(true);
  });

  it('treats the base path itself as inside', () => {
    expect(isPathOutside(root, root))
      .toBe(false);
  });

  it('builds the operator history directory under the results root', () => {
    expect(resolveStTestOperatorHistoryDirectory(root, 'My Operator!'))
      .toBe(path.join(root, '.vscode', 'st-results', 'My_Operator_'));
  });
});

describe('toDisplayPath', () => {
  let root: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'mstt-display-path-'));
  });

  afterEach(() => {
    jest.restoreAllMocks();
    fs.rmSync(root, {
      recursive: true,
      force: true,
    });
  });

  it('renders in-workspace paths relative to the base with forward slashes', () => {
    expect(toDisplayPath(root, path.join(root, 'a', 'b.csv')))
      .toBe('a/b.csv');
  });

  it('falls back to the basename for the base path itself', () => {
    expect(toDisplayPath(root, root))
      .toBe(path.basename(root));
  });

  it('renders only the basename for paths outside the base', () => {
    expect(toDisplayPath(root, path.join(root, '..', 'outside.csv')))
      .toBe('outside.csv');
  });

  it('normalizes foreign backslash escapes before the containment check', () => {
    expect(toDisplayPath(root, path.join(root, '..') + '\\escape.csv'))
      .toBe('escape.csv');
  });
});

describe('validateStTestOperatorDirectory', () => {
  let workspaceRoot: string;

  beforeEach(() => {
    workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mstt-validate-'));
  });

  afterEach(() => {
    jest.restoreAllMocks();
    fs.rmSync(workspaceRoot, {
      recursive: true,
      force: true,
    });
  });

  it('accepts an operator directory inside the workspace', () => {
    const operatorPath = path.join(workspaceRoot, 'op');

    fs.mkdirSync(operatorPath);

    expect(() => validateStTestOperatorDirectory(workspaceRoot, operatorPath))
      .not.toThrow();
  });

  it('rejects an operator directory outside the workspace', () => {
    const outside = path.join(path.dirname(workspaceRoot), 'outside-op');

    fs.mkdirSync(outside, { recursive: true });

    try {
      expect(() => validateStTestOperatorDirectory(workspaceRoot, outside))
        .toThrow(/Selected operator is outside the current workspace/);
    }
    finally {
      fs.rmSync(outside, {
        recursive: true,
        force: true,
      });
    }
  });

  it('rejects a missing operator directory', () => {
    expect(() => validateStTestOperatorDirectory(workspaceRoot, path.join(workspaceRoot, 'missing')))
      .toThrow(/Selected operator directory does not exist/);
  });

  it('rejects a non-directory operator path', () => {
    const filePath = path.join(workspaceRoot, 'not-a-dir');

    fs.writeFileSync(filePath, 'x');

    expect(() => validateStTestOperatorDirectory(workspaceRoot, filePath))
      .toThrow(/Selected operator directory does not exist/);
  });

  it('propagates non-ENOENT stat errors', () => {
    const operatorPath = path.join(workspaceRoot, 'op');

    fs.mkdirSync(operatorPath);

    const mutableFs = jest.requireActual<typeof import('fs')>('fs');

    jest.spyOn(mutableFs, 'statSync')
      .mockImplementationOnce(() => {
        throw Object.assign(new Error('permission denied'), { code: 'EACCES' });
      });

    expect(() => validateStTestOperatorDirectory(workspaceRoot, operatorPath))
      .toThrow(/permission denied/);
  });

  it('rejects an operator whose realpath escapes the workspace', () => {
    const operatorPath = path.join(workspaceRoot, 'op');

    fs.mkdirSync(operatorPath);

    const mutableFs = jest.requireActual<typeof import('fs')>('fs');
    const realRealpath = mutableFs.realpathSync.bind(mutableFs);

    jest.spyOn(mutableFs, 'realpathSync')
      .mockImplementation((((p: fs.PathLike) => {
        if (String(p) === operatorPath) {
          return path.join(workspaceRoot, '..', 'escape-op');
        }

        return realRealpath(p);
      }) as typeof fs.realpathSync));

    expect(() => validateStTestOperatorDirectory(workspaceRoot, operatorPath))
      .toThrow(/Selected operator resolves outside the current workspace/);
  });
});
