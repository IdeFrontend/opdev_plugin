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

// Node 24 freezes the fs module namespace, so jest.spyOn(fs, ...) cannot
// redefine its members. Wrap the real module in call-countable mocks instead.
// realpathSync stays untouched so its `.native` sub-function keeps working.
jest.mock('fs', () => {
  const actual = jest.requireActual('fs') as typeof fs;

  return {
    ...actual,
    closeSync: jest.fn(actual.closeSync),
    fstatSync: jest.fn(actual.fstatSync),
    lstatSync: jest.fn(actual.lstatSync),
    readSync: jest.fn(actual.readSync),
  };
});

import {
  buildStTestResultReport,
  MAX_ST_TEST_RESULT_FILE_BYTES,
  MAX_ST_TEST_RESULT_ROWS,
  type CompletedStTestArtifact,
} from '@plugin/domain/services/st-test-result-parser';
import {
  formatStTestResultStatus,
  type StTestMode,
} from '@shared/st-test-results';

const HEADER = 'testcase_name,dyn_precision,cst_precision,bin_precision,precision_status';

describe('ST test result parser', () => {
  let workspaceRoot: string;
  let operatorPath: string;
  let runDirectory: string;

  beforeEach(() => {
    workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mstt-st-results-'));
    operatorPath = path.join(workspaceRoot, 'operators', 'add');
    runDirectory = path.join(workspaceRoot, '.vscode', 'st-results', 'run-id');
    fs.mkdirSync(operatorPath, { recursive: true });
    fs.mkdirSync(runDirectory, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(workspaceRoot, {
      recursive: true,
      force: true,
    });
  });

  function createArtifact(
    sequence: number,
    mode: StTestMode,
    inputName: string,
  ): CompletedStTestArtifact {
    const inputCsvPath = path.join(operatorPath, 'tests', 'st', 'arch35', inputName);
    const outputCsvPath = path.join(
      runDirectory,
      mode,
      `${String(sequence)
        .padStart(3, '0')}-result.csv`,
    );

    fs.mkdirSync(path.dirname(inputCsvPath), { recursive: true });
    fs.mkdirSync(path.dirname(outputCsvPath), { recursive: true });
    fs.writeFileSync(inputCsvPath, 'input');

    return {
      artifactId: `artifact-${String(sequence)}`,
      sequence,
      mode,
      inputCsvPath,
      outputCsvPath,
    };
  }

  function build(artifacts: readonly CompletedStTestArtifact[]) {
    return buildStTestResultReport({
      workspaceRoot,
      operatorPath,
      operatorName: 'add',
      runId: 'run-id',
      runDirectory,
      artifacts,
    });
  }

  it('always leads an invalid row status with the localized INVALID label', () => {
    const invalidWithRaw = formatStTestResultStatus(
      {
        outcome: 'invalid',
        precisionStatus: 'PASS',
      },
      'INVALID',
      (status) => `INVALID (CSV: ${status})`,
    );
    const invalidWithoutRaw = formatStTestResultStatus(
      {
        outcome: 'invalid',
        precisionStatus: '',
      },
      'INVALID',
      (status) => `INVALID (CSV: ${status})`,
    );

    expect(invalidWithRaw)
      .toBe('INVALID (CSV: PASS)');
    expect(invalidWithoutRaw)
      .toBe('INVALID');
  });

  it('accepts BOM, CRLF, reordered/extra headers, quoted delimiters, escaped quotes, and embedded newlines', () => {
    const artifact = createArtifact(1, 'kernel', 'kernel-cases.csv');
    const csv = '\uFEFFextra,precision_status,bin_precision,testcase_name,cst_precision,dyn_precision\r\n'
      + 'ignored," pass ",fp16,"case, ""quoted""\nnext",0.2%,0.1%\r\n';

    fs.writeFileSync(artifact.outputCsvPath, csv, 'utf8');

    const report = build([artifact]);

    expect(report.outcome)
      .toBe('passed');
    expect(report.summary)
      .toEqual({
        total: 1,
        passed: 1,
        failed: 0,
        invalid: 0,
        files: 1,
        invalidFiles: 0,
      });
    expect(report.rows[0])
      .toEqual({
        id: 'artifact-1:2',
        artifactId: 'artifact-1',
        mode: 'kernel',
        testFile: 'tests/st/arch35/kernel-cases.csv',
        testcaseName: 'case, "quoted"\nnext',
        dynPrecision: '0.1%',
        cstPrecision: '0.2%',
        binPrecision: 'fp16',
        precisionStatus: 'PASS',
        outcome: 'pass',
      });
    expect(report.runDirectory)
      .toBe('.vscode/st-results/run-id');
    expect(report.files[0].resultFile)
      .toBe('.vscode/st-results/run-id/kernel/001-result.csv');
    expect(JSON.stringify(report)).not.toContain(workspaceRoot);
  });

  it('combines all modes in execution order and preserves duplicate testcase names', () => {
    const artifacts = [
      createArtifact(3, 'e2e', 'e2e.csv'),
      createArtifact(1, 'kernel', 'kernel.csv'),
      createArtifact(2, 'aclnn', 'aclnn.csv'),
    ];

    fs.writeFileSync(artifacts[0].outputCsvPath, `${HEADER}\nshared,1,2,3,PASS\n`);
    fs.writeFileSync(artifacts[1].outputCsvPath, `${HEADER}\nshared,1,2,3,PASS\nshared,1,2,3,FAIL\n`);
    fs.writeFileSync(artifacts[2].outputCsvPath, `${HEADER}\nshared,1,2,3,PASS\n`);

    const report = build(artifacts);

    expect(report.outcome)
      .toBe('failed');
    expect(report.rows.map((row) => [
      row.mode,
      row.testFile,
      row.testcaseName,
      row.outcome,
    ]))
      .toEqual([
        [
          'kernel',
          'tests/st/arch35/kernel.csv',
          'shared',
          'pass',
        ],
        [
          'kernel',
          'tests/st/arch35/kernel.csv',
          'shared',
          'fail',
        ],
        [
          'aclnn',
          'tests/st/arch35/aclnn.csv',
          'shared',
          'pass',
        ],
        [
          'e2e',
          'tests/st/arch35/e2e.csv',
          'shared',
          'pass',
        ],
      ]);
    expect(report.rows.map((row) => row.id))
      .toEqual([
        'artifact-1:2',
        'artifact-1:3',
        'artifact-2:2',
        'artifact-3:2',
      ]);
    expect(report.summary)
      .toEqual({
        total: 4,
        passed: 3,
        failed: 1,
        invalid: 0,
        files: 3,
        invalidFiles: 0,
      });
  });

  it('allows omitted trailing optional columns but rejects fields beyond the header', () => {
    const artifact = createArtifact(1, 'kernel', 'optional-columns.csv');
    const header = `${HEADER},optional_note,optional_debug`;

    fs.writeFileSync(
      artifact.outputCsvPath,
      `${header}\nvalid,1,2,3,PASS\nunexpected,1,2,3,PASS,,,extra\n`,
    );

    const report = build([artifact]);

    expect(report.rows.map((row) => row.outcome))
      .toEqual([
        'pass',
        'invalid',
      ]);
    expect(report.files[0])
      .toMatchObject({
        rowCount: 2,
        error: {
          code: 'invalid_row',
          detail: '3',
        },
      });
    expect(report.outcome)
      .toBe('invalid');
  });

  it('recognizes only ASCII case variants of PASS and FAIL', () => {
    const artifact = createArtifact(1, 'kernel', 'ascii-status.csv');

    fs.writeFileSync(
      artifact.outputCsvPath,
      `${HEADER}\npass,1,2,3,PaSs\nfail,1,2,3,fAiL\nsharp-s,1,2,3,paß\nlong-s,1,2,3,paſs\ndotless-i,1,2,3,faıl\n`,
    );

    const report = build([artifact]);

    expect(report.rows.map((row) => [
      row.precisionStatus,
      row.outcome,
    ]))
      .toEqual([
        [
          'PASS',
          'pass',
        ],
        [
          'FAIL',
          'fail',
        ],
        [
          'paß',
          'invalid',
        ],
        [
          'paſs',
          'invalid',
        ],
        [
          'faıl',
          'invalid',
        ],
      ]);
    expect(report.outcome)
      .toBe('invalid');
  });

  it.each([
    {
      name: 'missing required header',
      content: 'testcase_name,dyn_precision,cst_precision,bin_precision\ncase,1,2,3\n',
      code: 'missing_header',
    },
    {
      name: 'duplicate required header',
      content: `${HEADER},precision_status\ncase,1,2,3,PASS,PASS\n`,
      code: 'duplicate_header',
    },
    {
      name: 'empty file',
      content: '',
      code: 'empty_result',
    },
    {
      name: 'header-only file',
      content: `${HEADER}\r\n`,
      code: 'empty_result',
    },
    {
      name: 'unclosed quoted field',
      content: `${HEADER}\n"case,1,2,3,PASS\n`,
      code: 'malformed_csv',
    },
  ])('marks a $name invalid without emitting rows', ({
    content, code,
  }) => {
    const artifact = createArtifact(1, 'kernel', 'input.csv');

    fs.writeFileSync(artifact.outputCsvPath, content);

    const report = build([artifact]);

    expect(report.outcome)
      .toBe('invalid');
    expect(report.rows)
      .toEqual([]);
    expect(report.files[0].error?.code)
      .toBe(code);
    expect(report.summary.invalidFiles)
      .toBe(1);
  });

  it('keeps valid sibling evidence while missing values, ragged rows, and unknown statuses are invalid', () => {
    const validArtifact = createArtifact(1, 'kernel', 'valid.csv');
    const invalidArtifact = createArtifact(2, 'aclnn', 'invalid.csv');

    fs.writeFileSync(validArtifact.outputCsvPath, `${HEADER}\n<script>alert(1)</script>,1,2,3,PASS\n`);
    fs.writeFileSync(
      invalidArtifact.outputCsvPath,
      `${HEADER}\n,1,2,3,PASS\ncase-unknown,1,2,3,UNVERIFIED\ncase-ragged,1,2\n`,
    );

    const report = build([
      validArtifact,
      invalidArtifact,
    ]);

    expect(report.outcome)
      .toBe('invalid');
    expect(report.summary)
      .toEqual({
        total: 4,
        passed: 1,
        failed: 0,
        invalid: 3,
        files: 2,
        invalidFiles: 1,
      });
    expect(report.rows[0].testcaseName)
      .toBe('<script>alert(1)</script>');
    expect(report.rows.slice(1)
      .map((row) => row.outcome))
      .toEqual([
        'invalid',
        'invalid',
        'invalid',
      ]);
    expect(report.rows[2].precisionStatus)
      .toBe('UNVERIFIED');
    expect(report.files[1])
      .toMatchObject({
        rowCount: 3,
        error: {
          code: 'invalid_row',
          detail: '2',
        },
      });
  });

  it.each([
    [
      'dyn_precision',
      'case,,2,3,PASS',
    ],
    [
      'cst_precision',
      'case,1,,3,PASS',
    ],
    [
      'bin_precision',
      'case,1,2,,PASS',
    ],
  ])('marks a row and the overall report invalid when %s is empty', (_field, row) => {
    const artifact = createArtifact(1, 'kernel', 'empty-precision.csv');

    fs.writeFileSync(artifact.outputCsvPath, `${HEADER}\n${row}\n`);

    const report = build([artifact]);

    expect(report.outcome)
      .toBe('invalid');
    expect(report.rows)
      .toHaveLength(1);
    expect(report.rows[0].outcome)
      .toBe('invalid');
    expect(report.summary)
      .toMatchObject({
        total: 1,
        invalid: 1,
        invalidFiles: 1,
      });
    expect(report.files[0].error?.code)
      .toBe('invalid_row');
  });

  it('rejects result paths outside the run directory, including a linked-directory escape', () => {
    const outsideDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'mstt-st-results-outside-'));

    try {
      const outsideCsvPath = path.join(outsideDirectory, 'outside.csv');
      const directArtifact = {
        ...createArtifact(1, 'kernel', 'outside.csv'),
        outputCsvPath: outsideCsvPath,
      };
      const linkedDirectory = path.join(runDirectory, 'linked-outside');
      const linkedArtifact = {
        ...createArtifact(2, 'aclnn', 'linked.csv'),
        outputCsvPath: path.join(linkedDirectory, 'outside.csv'),
      };

      fs.writeFileSync(outsideCsvPath, `${HEADER}\ncase,1,2,3,PASS\n`);
      fs.symlinkSync(
        outsideDirectory,
        linkedDirectory,
        process.platform === 'win32' ? 'junction' : 'dir',
      );

      const report = build([
        directArtifact,
        linkedArtifact,
      ]);

      expect(report.files.map((file) => file.error?.code))
        .toEqual([
          'file_unreadable',
          'file_unreadable',
        ]);
      expect(report.rows)
        .toEqual([]);
      expect(report.outcome)
        .toBe('invalid');
    }
    finally {
      fs.rmSync(outsideDirectory, {
        recursive: true,
        force: true,
      });
    }
  });

  it('rejects invalid UTF-8 and files above the 16 MiB limit', () => {
    const invalidUtf8 = createArtifact(1, 'kernel', 'invalid-utf8.csv');
    const tooLarge = createArtifact(2, 'kernel', 'too-large.csv');

    fs.writeFileSync(invalidUtf8.outputCsvPath, Buffer.from([
      0xc3,
      0x28,
    ]));
    fs.writeFileSync(tooLarge.outputCsvPath, '');
    fs.truncateSync(tooLarge.outputCsvPath, MAX_ST_TEST_RESULT_FILE_BYTES + 1);

    const report = build([
      invalidUtf8,
      tooLarge,
    ]);

    expect(report.files.map((file) => file.error?.code))
      .toEqual([
        'invalid_utf8',
        'file_too_large',
      ]);
    expect(report.files[1].error?.detail)
      .toBe(String(MAX_ST_TEST_RESULT_FILE_BYTES + 1));
    expect(report.outcome)
      .toBe('invalid');
  });

  it('never emits more than 20,000 aggregate rows', () => {
    const first = createArtifact(1, 'kernel', 'first.csv');
    const overflow = createArtifact(2, 'e2e', 'overflow.csv');
    const sibling = createArtifact(3, 'aclnn', 'sibling.csv');
    const firstRows = Array.from({ length: MAX_ST_TEST_RESULT_ROWS - 1 }, (_, index) =>
      `case-${String(index)},1,2,3,PASS`);

    fs.writeFileSync(first.outputCsvPath, `${HEADER}\n${firstRows.join('\n')}\n`);
    fs.writeFileSync(overflow.outputCsvPath, `${HEADER}\noverflow-1,1,2,3,PASS\noverflow-2,1,2,3,PASS\n`);
    fs.writeFileSync(sibling.outputCsvPath, `${HEADER}\nsibling,1,2,3,PASS\n`);

    const report = build([
      first,
      overflow,
      sibling,
    ]);

    expect(report.rows)
      .toHaveLength(MAX_ST_TEST_RESULT_ROWS);
    expect(report.files[1])
      .toMatchObject({
        rowCount: 0,
        error: {
          code: 'row_limit_exceeded',
          detail: String(MAX_ST_TEST_RESULT_ROWS),
        },
      });
    expect(report.files[2].rowCount)
      .toBe(1);
    expect(report.files[2].error)
      .toBeUndefined();
    expect(report.rows[report.rows.length - 1].testcaseName)
      .toBe('sibling');
    expect(report.outcome)
      .toBe('invalid');
    expect(report.summary.invalidFiles)
      .toBe(1);
  });

  it('skips blank CSV records without counting them', () => {
    const artifact = createArtifact(1, 'kernel', 'blank-lines.csv');

    fs.writeFileSync(
      artifact.outputCsvPath,
      `${HEADER}\nfirst,1,2,3,PASS\n\nlast,1,2,3,PASS\n`,
    );

    const report = build([artifact]);

    expect(report.summary.total)
      .toBe(2);
    expect(report.rows.map((row) => row.testcaseName))
      .toEqual([
        'first',
        'last',
      ]);
  });

  it('accepts a quoted final field followed by a CRLF after a quoted field', () => {
    const artifact = createArtifact(1, 'kernel', 'quoted-final.csv');

    fs.writeFileSync(
      artifact.outputCsvPath,
      `${HEADER}\ncase,1,2,3,"PASS"\r\nother,1,2,3,"PASS"\n`,
    );

    const report = build([artifact]);

    expect(report.rows.map((row) => [
      row.testcaseName,
      row.outcome,
    ]))
      .toEqual([
        [
          'case',
          'pass',
        ],
        [
          'other',
          'pass',
        ],
      ]);
  });

  it('rejects a stray character directly after a quoted field', () => {
    const artifact = createArtifact(1, 'kernel', 'stray-after-quote.csv');

    fs.writeFileSync(artifact.outputCsvPath, `${HEADER}\n"case"x,1,2,3,PASS\n`);

    const report = build([artifact]);

    expect(report.files[0].error?.code)
      .toBe('malformed_csv');
  });

  it('rejects a quote appearing inside an unquoted field', () => {
    const artifact = createArtifact(1, 'kernel', 'quote-in-field.csv');

    fs.writeFileSync(artifact.outputCsvPath, `${HEADER}\nca"se,1,2,3,PASS\n`);

    const report = build([artifact]);

    expect(report.files[0].error?.code)
      .toBe('malformed_csv');
  });

  it('parses the final record when the file has no trailing newline', () => {
    const artifact = createArtifact(1, 'kernel', 'no-trailing-newline.csv');

    fs.writeFileSync(artifact.outputCsvPath, `${HEADER}\ncase,1,2,3,PASS`);

    const report = build([artifact]);

    expect(report.rows)
      .toHaveLength(1);
    expect(report.rows[0].testcaseName)
      .toBe('case');
    expect(report.rows[0].outcome)
      .toBe('pass');
  });

  it('rejects a run directory that is itself a symbolic link', () => {
    const realRunDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'mstt-st-parser-real-'));

    try {
      const artifact = createArtifact(1, 'kernel', 'linked-run.csv');

      fs.writeFileSync(artifact.outputCsvPath, `${HEADER}\ncase,1,2,3,PASS\n`);
      fs.rmSync(runDirectory, {
        recursive: true,
        force: true,
      });
      fs.symlinkSync(
        realRunDirectory,
        runDirectory,
        process.platform === 'win32' ? 'junction' : 'dir',
      );
      fs.mkdirSync(path.join(runDirectory, 'kernel'), { recursive: true });
      fs.writeFileSync(artifact.outputCsvPath, `${HEADER}\ncase,1,2,3,PASS\n`);

      const report = build([artifact]);

      expect(report.files[0].error?.code)
        .toBe('file_unreadable');
    }
    finally {
      fs.rmSync(realRunDirectory, {
        recursive: true,
        force: true,
      });
    }
  });

  it('wraps realpath failures for the run directory as file_unreadable', () => {
    const artifact = createArtifact(1, 'kernel', 'realpath-fail.csv');

    fs.writeFileSync(artifact.outputCsvPath, `${HEADER}\ncase,1,2,3,PASS\n`);

    const realpathSpy = jest.spyOn(fs.realpathSync, 'native')
      .mockImplementationOnce(() => {
        throw new Error('realpath boom');
      });

    try {
      const report = build([artifact]);

      expect(report.files[0].error?.code)
        .toBe('file_unreadable');
    }
    finally {
      realpathSpy.mockRestore();
    }
  });

  it('rejects a result file whose identity changed after it was opened', () => {
    const artifact = createArtifact(1, 'kernel', 'identity-change.csv');

    fs.writeFileSync(artifact.outputCsvPath, `${HEADER}\ncase,1,2,3,PASS\n`);

    const lstatMock = fs.lstatSync as jest.Mock;
    const realLstat = jest.requireActual<typeof fs>('fs').lstatSync;
    let callCount = 0;

    // validateResultPath (1), resolveRealDirectory (2), then the opened-file
    // identity check (3): the third lstat reports a different dev/ino pair.
    lstatMock.mockImplementation((...args: Parameters<typeof fs.lstatSync>) => {
      callCount += 1;

      if (callCount === 3) {
        return {
          isFile: () => true,
          isSymbolicLink: () => false,
          isDirectory: () => false,
          dev: 424242,
          ino: 424242,
          size: 1,
        } as unknown as fs.Stats;
      }

      return realLstat(...args);
    });

    try {
      const report = build([artifact]);

      expect(report.files[0].error?.code)
        .toBe('file_unreadable');
    }
    finally {
      lstatMock.mockClear();
    }
  });

  it('rejects a file that outgrows the size limit while being read', () => {
    const artifact = createArtifact(1, 'kernel', 'growing-file.csv');

    fs.writeFileSync(artifact.outputCsvPath, `${HEADER}\ncase,1,2,3,PASS\n`);

    const readSyncMock = fs.readSync as jest.Mock;

    readSyncMock.mockImplementationOnce(() => MAX_ST_TEST_RESULT_FILE_BYTES + 5);

    try {
      const report = build([artifact]);

      expect(report.files[0].error)
        .toMatchObject({
          code: 'file_too_large',
          detail: String(MAX_ST_TEST_RESULT_FILE_BYTES + 5),
        });
    }
    finally {
      readSyncMock.mockClear();
    }
  });

  it('rejects an opened descriptor that is not a regular file', () => {
    const artifact = createArtifact(1, 'kernel', 'not-regular.csv');

    fs.writeFileSync(artifact.outputCsvPath, `${HEADER}\ncase,1,2,3,PASS\n`);

    const fstatMock = fs.fstatSync as jest.Mock;

    fstatMock.mockImplementationOnce(() => ({
      isFile: () => false,
      size: 1,
      dev: 1,
      ino: 1,
    } as unknown as fs.Stats));

    try {
      const report = build([artifact]);

      expect(report.files[0].error?.code)
        .toBe('file_unreadable');
    }
    finally {
      fstatMock.mockClear();
    }
  });

  it('wraps unexpected descriptor errors as file_unreadable', () => {
    const artifact = createArtifact(1, 'kernel', 'descriptor-error.csv');

    fs.writeFileSync(artifact.outputCsvPath, `${HEADER}\ncase,1,2,3,PASS\n`);

    const fstatMock = fs.fstatSync as jest.Mock;

    fstatMock.mockImplementationOnce(() => {
      throw new Error('EBADF');
    });

    try {
      const report = build([artifact]);

      expect(report.files[0].error?.code)
        .toBe('file_unreadable');
    }
    finally {
      fstatMock.mockClear();
    }
  });

  it('propagates non-parse errors thrown while closing the descriptor', () => {
    const artifact = createArtifact(1, 'kernel', 'close-fail.csv');

    fs.writeFileSync(artifact.outputCsvPath, `${HEADER}\ncase,1,2,3,PASS\n`);

    const closeSyncMock = fs.closeSync as jest.Mock;

    closeSyncMock.mockImplementationOnce(() => {
      throw new Error('EBADF');
    });

    try {
      expect(() => build([artifact]))
        .toThrow('EBADF');
    }
    finally {
      closeSyncMock.mockClear();
    }
  });
});
