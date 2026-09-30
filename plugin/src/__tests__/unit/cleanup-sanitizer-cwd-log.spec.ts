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

import { cleanupCwdSanitizerLog } from '@plugin/helpers/cleanup-sanitizer-cwd-log';

describe('cleanupCwdSanitizerLog', () => {
  let root: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'san-cwd-'));
  });

  afterEach(() => {
    fs.rmSync(root, {
      recursive: true,
      force: true,
    });
  });

  it('removes the cwd mindstudio_sanitizer_log directory and its contents', () => {
    const dir = path.join(root, 'mindstudio_sanitizer_log');

    fs.mkdirSync(dir);
    fs.writeFileSync(path.join(dir, 'mssanitizer_20260101_123.log'), 'runtime log');

    expect(cleanupCwdSanitizerLog(root))
      .toBe(true);
    expect(fs.existsSync(dir))
      .toBe(false);
    expect(fs.existsSync(root))
      .toBe(true);
  });

  it('leaves the .vscode report dir untouched', () => {
    const cwdDir = path.join(root, 'mindstudio_sanitizer_log');
    const reportDir = path.join(root, '.vscode', 'mindstudio_sanitizer_log');

    fs.mkdirSync(cwdDir);
    fs.mkdirSync(reportDir, { recursive: true });
    fs.writeFileSync(path.join(reportDir, 'mssanitizer_1.log'), 'report');

    cleanupCwdSanitizerLog(root);

    expect(fs.existsSync(cwdDir))
      .toBe(false);
    expect(fs.existsSync(reportDir))
      .toBe(true);
  });

  it('is a no-op (no throw, returns false) when the directory is absent', () => {
    expect(cleanupCwdSanitizerLog(root))
      .toBe(false);
  });

  it('returns false for empty input', () => {
    expect(cleanupCwdSanitizerLog(''))
      .toBe(false);
  });
});
