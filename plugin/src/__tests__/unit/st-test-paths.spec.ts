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
  resolveStTestOutputCsvPath,
  resolveStTestPluginDir,
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

  it('rejects an empty lowercase CSV', () => {
    const inputDir = resolveStTestInputDir(root);

    fs.mkdirSync(inputDir, { recursive: true });
    fs.writeFileSync(path.join(inputDir, 'empty.csv'), '\r\n\n');

    expect(() => discoverStTestInputCsvFiles(root))
      .toThrow(/ST CSV file is empty:.*empty\.csv/);
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
});
