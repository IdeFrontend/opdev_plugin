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

import { getIdeConfigDir } from '@plugin/helpers/ide-config-dir';
import { getLatestSanitizerLogAbsPath } from '@plugin/helpers/sanitizer-log-path';

describe('getLatestSanitizerLogAbsPath', () => {
  let workspaceRoot: string;
  let logDir: string;

  beforeEach(() => {
    workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sanitizer-log-'));
    logDir = path.join(getIdeConfigDir(workspaceRoot), 'mindstudio_sanitizer_log');
  });

  afterEach(() => {
    fs.rmSync(workspaceRoot, {
      recursive: true,
      force: true,
    });
  });

  it('returns undefined when the log directory is missing', () => {
    expect(getLatestSanitizerLogAbsPath(workspaceRoot))
      .toBeUndefined();
  });

  it('returns undefined when the log directory path is a file, not a directory', () => {
    fs.mkdirSync(getIdeConfigDir(workspaceRoot), { recursive: true });
    fs.writeFileSync(logDir, 'not a dir', 'utf8');

    expect(getLatestSanitizerLogAbsPath(workspaceRoot))
      .toBeUndefined();
  });

  it('returns undefined when no mssanitizer_*.log / npu-check_*.log files exist', () => {
    fs.mkdirSync(logDir, { recursive: true });
    fs.writeFileSync(path.join(logDir, 'notes.txt'), 'hi', 'utf8');

    expect(getLatestSanitizerLogAbsPath(workspaceRoot))
      .toBeUndefined();
  });

  it('picks the newest mssanitizer_*.log / npu-check_*.log by mtime', () => {
    fs.mkdirSync(logDir, { recursive: true });
    const older = path.join(logDir, 'mssanitizer_1700000000000.log');
    const newer = path.join(logDir, 'npu-check_1700001000000.log');

    fs.writeFileSync(older, 'old', 'utf8');
    fs.writeFileSync(newer, 'new', 'utf8');
    // Pin mtimes so the newest-by-mtime pick is deterministic regardless of write timing.
    fs.utimesSync(older, new Date(1000), new Date(1000));
    fs.utimesSync(newer, new Date(2000), new Date(2000));

    expect(getLatestSanitizerLogAbsPath(workspaceRoot))
      .toBe(newer);
  });

  it('picks the newest report across the mindstudio_sanitizer_log and npu-check-log dirs', () => {
    const npuCheckLogDir = path.join(getIdeConfigDir(workspaceRoot), 'npu-check-log');

    fs.mkdirSync(logDir, { recursive: true });
    fs.mkdirSync(npuCheckLogDir, { recursive: true });

    const msLog = path.join(logDir, 'mssanitizer_1700000000000.log');
    const npuLog = path.join(npuCheckLogDir, 'npu-check_1700001000000.log');

    fs.writeFileSync(msLog, 'ms', 'utf8');
    fs.writeFileSync(npuLog, 'npu', 'utf8');
    fs.utimesSync(msLog, new Date(2000), new Date(2000));
    fs.utimesSync(npuLog, new Date(1000), new Date(1000));

    // The newer mssanitizer report wins even though the npu-check dir is scanned too.
    expect(getLatestSanitizerLogAbsPath(workspaceRoot))
      .toBe(msLog);

    fs.utimesSync(npuLog, new Date(3000), new Date(3000));

    expect(getLatestSanitizerLogAbsPath(workspaceRoot))
      .toBe(npuLog);
  });

  it('skips non-matching names and directory entries', () => {
    fs.mkdirSync(logDir, { recursive: true });
    fs.writeFileSync(path.join(logDir, 'mssanitizer.txt'), 'no', 'utf8');
    fs.writeFileSync(path.join(logDir, 'other.log'), 'no', 'utf8');
    fs.mkdirSync(path.join(logDir, 'mssanitizer_0000000000000.log'), { recursive: true });
    const real = path.join(logDir, 'npu-check_1700002000000.log');

    fs.writeFileSync(real, 'real', 'utf8');

    expect(getLatestSanitizerLogAbsPath(workspaceRoot))
      .toBe(real);
  });
});
