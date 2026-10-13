/**
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 * This program is free software, you can redistribute it and/or modify it under the terms and conditions of
 * CANN Open Software License Agreement Version 2.0 (the "License").
 * Please refer to the License for details. You may not use this file except in compliance with the License.
 * THIS SOFTWARE IS PROVIDED ON AN "AS IS" BASIS, WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED,
 * INCLUDING BUT NOT LIMITED TO NON-INFRINGEMENT, MERCHANTABILITY, OR FITNESS FOR A PARTICULAR PURPOSE.
 * See LICENSE in the root of the software repository for the full text of the License.
 */
jest.mock('vscode', () => ({ workspace: { workspaceFolders: undefined } }));

jest.mock('@plugin/helpers/ide-config-dir', () => ({ joinIdeConfigPath: jest.fn() }));

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import * as vscode from 'vscode';

import { EnvironmentVariableReader } from '@plugin/class/environment-variable-reader';
import { joinIdeConfigPath } from '@plugin/helpers/ide-config-dir';

const TEST_VAR = 'MSTT_ENV_READER_TEST_VAR';

describe('EnvironmentVariableReader', () => {
  let tempDir: string;

  beforeEach(() => {
    EnvironmentVariableReader.clearCache();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mstt-env-reader-'));
    (joinIdeConfigPath as jest.Mock).mockClear();
    (joinIdeConfigPath as jest.Mock)
      .mockImplementation((_root: string, fileName: string) => path.join(tempDir, fileName));
    (vscode.workspace as { workspaceFolders: unknown }).workspaceFolders = [{ uri: { fsPath: tempDir } }];
  });

  afterEach(() => {
    delete process.env[TEST_VAR];
    fs.rmSync(tempDir, {
      recursive: true,
      force: true,
    });
  });

  it('reads the variable directly from process.env without touching the .env file', () => {
    process.env[TEST_VAR] = 'from-process';

    expect(EnvironmentVariableReader.getEnv(TEST_VAR))
      .toBe('from-process');
    expect(joinIdeConfigPath).not.toHaveBeenCalled();
  });

  it('returns undefined without loading the .env file when fallback is disabled', () => {
    expect(EnvironmentVariableReader.getEnv(TEST_VAR, false))
      .toBeUndefined();
    expect(joinIdeConfigPath).not.toHaveBeenCalled();
  });

  it('loads the value from the .arts/.env file as a fallback', () => {
    fs.writeFileSync(path.join(tempDir, '.env'), `${TEST_VAR}=from-env-file\n`);

    expect(EnvironmentVariableReader.getEnv(TEST_VAR))
      .toBe('from-env-file');
    expect(joinIdeConfigPath)
      .toHaveBeenCalledWith(tempDir, '.env');
  });

  it('caches loaded values and does not reload the .env file', () => {
    const envFile = path.join(tempDir, '.env');

    fs.writeFileSync(envFile, 'MSTT_CACHED_KEY=first\n');
    expect(EnvironmentVariableReader.getEnv('MSTT_CACHED_KEY'))
      .toBe('first');

    fs.writeFileSync(envFile, 'MSTT_CACHED_KEY=second\n');
    expect(EnvironmentVariableReader.getEnv('MSTT_CACHED_KEY'))
      .toBe('first');
    expect(joinIdeConfigPath)
      .toHaveBeenCalledTimes(1);
  });

  it('clearCache forces a reload of the .env file', () => {
    const envFile = path.join(tempDir, '.env');

    fs.writeFileSync(envFile, 'MSTT_CACHED_KEY=first\n');
    expect(EnvironmentVariableReader.getEnv('MSTT_CACHED_KEY'))
      .toBe('first');

    fs.writeFileSync(envFile, 'MSTT_CACHED_KEY=second\n');
    EnvironmentVariableReader.clearCache();
    expect(EnvironmentVariableReader.getEnv('MSTT_CACHED_KEY'))
      .toBe('second');
  });

  it('returns undefined when the .env file does not exist', () => {
    expect(EnvironmentVariableReader.getEnv('MSTT_MISSING_KEY'))
      .toBeUndefined();
  });

  it('returns undefined when there is no workspace folder and never retries', () => {
    (vscode.workspace as { workspaceFolders: unknown }).workspaceFolders = undefined;

    expect(EnvironmentVariableReader.getEnv('MSTT_MISSING_KEY'))
      .toBeUndefined();
    expect(joinIdeConfigPath).not.toHaveBeenCalled();

    (vscode.workspace as { workspaceFolders: unknown }).workspaceFolders = [{ uri: { fsPath: tempDir } }];
    fs.writeFileSync(path.join(tempDir, '.env'), 'MSTT_AFTER_NO_WS=1\n');

    expect(EnvironmentVariableReader.getEnv('MSTT_AFTER_NO_WS'))
      .toBeUndefined();
  });

  it('parses quotes, inline comments, empty values and garbage lines from the .env file', () => {
    fs.writeFileSync(path.join(tempDir, '.env'), [
      '# a comment line',
      '',
      'EMPTY=',
      'SPACES =  value with spaces  ',
      'QUOTED="hello world"',
      'SINGLE=\'single quoted\'',
      'INLINE=value#trailing comment',
      'HASH_INSIDE=some"x#y',
      'GARBAGE_NO_EQUALS',
      '=no-name',
    ].join('\n'));

    expect(EnvironmentVariableReader.getEnv('MSTT_TRIGGER_LOAD'))
      .toBeUndefined();
    expect(EnvironmentVariableReader.getAllCachedEnv())
      .toEqual(new Map<string, string>([
        [
          'EMPTY',
          '',
        ],
        [
          'SPACES',
          'value with spaces',
        ],
        [
          'QUOTED',
          'hello world',
        ],
        [
          'SINGLE',
          'single quoted',
        ],
        [
          'INLINE',
          'value',
        ],
        [
          'HASH_INSIDE',
          'some"x#y',
        ],
      ]));
  });

  it('treats an empty stored value as missing when reading through getEnv', () => {
    fs.writeFileSync(path.join(tempDir, '.env'), 'EMPTY=\n');

    expect(EnvironmentVariableReader.getEnv('EMPTY'))
      .toBeUndefined();
    expect(EnvironmentVariableReader.getAllCachedEnv()
      .get('EMPTY'))
      .toBe('');
  });

  it('handles a .env read failure gracefully and marks the load as done', () => {
    (joinIdeConfigPath as jest.Mock)
      .mockReturnValueOnce(tempDir);

    expect(EnvironmentVariableReader.getEnv('MSTT_FAIL_KEY'))
      .toBeUndefined();
    expect(EnvironmentVariableReader.getEnv('MSTT_FAIL_KEY'))
      .toBeUndefined();
    expect(joinIdeConfigPath)
      .toHaveBeenCalledTimes(1);
  });

  it('getAllCachedEnv returns a copy that does not mutate the cache', () => {
    fs.writeFileSync(path.join(tempDir, '.env'), 'MSTT_COPY_KEY=1\n');

    expect(EnvironmentVariableReader.getEnv('MSTT_COPY_KEY'))
      .toBe('1');

    const snapshot = EnvironmentVariableReader.getAllCachedEnv();

    snapshot.set('MSTT_COPY_KEY', 'tampered');

    expect(EnvironmentVariableReader.getAllCachedEnv()
      .get('MSTT_COPY_KEY'))
      .toBe('1');
  });
});
