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
  collectSanitizerLogReports, isNpuCheckReport,
  parseSanitizerLogTimestamp,
} from '@plugin/helpers/sanitizer-log-reports';

describe('collectSanitizerLogReports', () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'san-reports-'));
  });

  afterEach(() => {
    fs.rmSync(dir, {
      recursive: true,
      force: true,
    });
  });

  const write = (name: string, content: string): void => {
    fs.writeFileSync(path.join(dir, name), content);
  };

  it('returns an entry for a non-empty mssanitizer_<ts>.log titled with the file name', () => {
    write('mssanitizer_1700000000000.log', 'report content');

    const reports = collectSanitizerLogReports(dir, new Set());

    expect(reports)
      .toHaveLength(1);
    expect(reports[0])
      .toMatchObject({
        title: 'mssanitizer_1700000000000.log',
        id: 'mssanitizer_1700000000000.log',
        timestamp: 1700000000000,
        path: path.join(dir, 'mssanitizer_1700000000000.log'),
        marked: false,
      });
  });

  it('returns an entry for a new npu-check_<ts>.log report titled with the file name', () => {
    write('npu-check_1700000000000.log', 'report content');

    const reports = collectSanitizerLogReports(dir, new Set());

    expect(reports)
      .toHaveLength(1);
    expect(reports[0])
      .toMatchObject({
        title: 'npu-check_1700000000000.log',
        id: 'npu-check_1700000000000.log',
        timestamp: 1700000000000,
        path: path.join(dir, 'npu-check_1700000000000.log'),
        marked: false,
      });
  });

  it('returns an entry for a legacy mssanitizer_<ts>-npu-check.log report', () => {
    write('mssanitizer_1700000000000-npu-check.log', 'report content');

    const reports = collectSanitizerLogReports(dir, new Set());

    expect(reports)
      .toHaveLength(1);
    expect(reports[0])
      .toMatchObject({
        title: 'mssanitizer_1700000000000-npu-check.log',
        timestamp: 1700000000000,
      });
  });

  it('skips a 0-byte (empty) log file left behind by a failed/aborted run', () => {
    write('mssanitizer_1700000000000.log', '');

    expect(collectSanitizerLogReports(dir, new Set()))
      .toEqual([]);
  });

  it('skips files that are not mssanitizer_<numeric>.log or npu-check_<numeric>.log', () => {
    write('notes.txt', 'hello');
    write('random.log', 'content');
    write('mssanitizer_notanumber.log', 'content');
    write('npu-check_notanumber.log', 'content');

    expect(collectSanitizerLogReports(dir, new Set()))
      .toEqual([]);
  });

  it('reflects the marked state from the provided set', () => {
    write('mssanitizer_1700000000000.log', 'content');

    const reports = collectSanitizerLogReports(dir, new Set(['mssanitizer_1700000000000.log']));

    expect(reports[0].marked)
      .toBe(true);
  });

  it('returns an empty array when the directory does not exist', () => {
    expect(collectSanitizerLogReports(path.join(dir, 'nope'), new Set()))
      .toEqual([]);
  });

  it('includes only the valid non-empty logs when the dir is mixed', () => {
    write('mssanitizer_1700000000001.log', 'a');
    write('mssanitizer_1700000000002.log', '');
    write('npu-check_1700000000003.log', 'b');
    write('junk.log', 'c');

    const ids = collectSanitizerLogReports(dir, new Set())
      .map((r) => r.id)
      .sort();

    expect(ids)
      .toEqual([
        'mssanitizer_1700000000001.log',
        'npu-check_1700000000003.log',
      ]);
  });
});

describe('isNpuCheckReport', () => {
  it('detects the npu-check_ prefix of a new report name', () => {
    expect(isNpuCheckReport('npu-check_1700000000000.log'))
      .toBe(true);
  });

  it('detects the legacy -npu-check marker in the file name', () => {
    expect(isNpuCheckReport('mssanitizer_1700000000000-npu-check.log'))
      .toBe(true);
  });

  it('treats a plain mssanitizer log as not an npu-check report', () => {
    expect(isNpuCheckReport('mssanitizer_1700000000000.log'))
      .toBe(false);
  });

  it('ignores an npu-check_ prefix or -npu-check segment in a parent directory name', () => {
    expect(isNpuCheckReport('/tmp/npu-check-dir/mssanitizer_1700000000000.log'))
      .toBe(false);
    expect(isNpuCheckReport('/tmp/npu-dir/mssanitizer_1700000000000.log'))
      .toBe(false);
  });

  it('detects the markers in a full path', () => {
    expect(isNpuCheckReport('/tmp/npu-check_1700000000000.log'))
      .toBe(true);
    expect(isNpuCheckReport('/tmp/mssanitizer_1700000000000-npu-check.log'))
      .toBe(true);
  });
});

describe('parseSanitizerLogTimestamp', () => {
  it('extracts the timestamp from npu-check and mssanitizer report names', () => {
    expect(parseSanitizerLogTimestamp('npu-check_1700000000000.log'))
      .toBe(1700000000000);
    expect(parseSanitizerLogTimestamp('mssanitizer_1700000000000-npu-check.log'))
      .toBe(1700000000000);
    expect(parseSanitizerLogTimestamp('mssanitizer_1700000000000.log'))
      .toBe(1700000000000);
  });

  it('extracts the timestamp from a full path', () => {
    expect(parseSanitizerLogTimestamp('/ws/npu-check_1766419043134.log'))
      .toBe(1766419043134);
    expect(parseSanitizerLogTimestamp('/ws/mssanitizer_1766419043134-npu-check.log'))
      .toBe(1766419043134);
  });

  it('returns undefined for names outside the tool naming patterns', () => {
    expect(parseSanitizerLogTimestamp('report.log'))
      .toBeUndefined();
    expect(parseSanitizerLogTimestamp('mssanitizer_notanumber.log'))
      .toBeUndefined();
    expect(parseSanitizerLogTimestamp('npu-check_notanumber.log'))
      .toBeUndefined();
    expect(parseSanitizerLogTimestamp('notes.txt'))
      .toBeUndefined();
  });
});
