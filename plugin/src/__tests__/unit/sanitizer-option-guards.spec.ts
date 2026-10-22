/**
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 * This program is free software, you can redistribute it and/or modify it under the terms and conditions of
 * CANN Open Software License Agreement Version 2.0 (the "License").
 * Please refer to the License for details. You may not use this file except in compliance with the License.
 * THIS SOFTWARE IS PROVIDED ON AN "AS IS" BASIS, WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED,
 * INCLUDING BUT NOT LIMITED TO NON-INFRINGEMENT, MERCHANTABILITY, OR FITNESS FOR A PARTICULAR PURPOSE.
 * See LICENSE in the root of the software repository for the full text of the License.
 */
import {
  normalizeMaxDebuglogSize,
  normalizeBlockId,
  normalizeLogLevel,
  normalizeNpuSanitizerTools,
  normalizeSanitizerCommand,
  normalizeSanitizerTools,
  buildSanitizerLogFileName,
  buildSanitizerLogFilePath,
  getSanitizerLogDirName,
  SANITIZER_LOG_DIR_NAMES,
  createSanitizerCommand,
} from '@plugin/domain/services/command-strategy/sanitizer-option-guards';

describe('normalizeMaxDebuglogSize (mssanitizer range 1..10240)', () => {
  it('keeps an in-range number', () => {
    expect(normalizeMaxDebuglogSize(1024))
      .toBe(1024);
  });

  it('accepts a numeric string', () => {
    expect(normalizeMaxDebuglogSize('2048'))
      .toBe(2048);
  });

  it('keeps the boundaries 1 and 10240', () => {
    expect(normalizeMaxDebuglogSize(1))
      .toBe(1);
    expect(normalizeMaxDebuglogSize(10240))
      .toBe(10240);
  });

  it('drops 0 (the reviewer-reported invalid value)', () => {
    expect(normalizeMaxDebuglogSize(0))
      .toBeUndefined();
  });

  it('drops negatives and values above 10240', () => {
    expect(normalizeMaxDebuglogSize(-5))
      .toBeUndefined();
    expect(normalizeMaxDebuglogSize(10241))
      .toBeUndefined();
  });

  it('drops empty / non-numeric / nullish', () => {
    expect(normalizeMaxDebuglogSize(''))
      .toBeUndefined();
    expect(normalizeMaxDebuglogSize('abc'))
      .toBeUndefined();
    expect(normalizeMaxDebuglogSize(undefined))
      .toBeUndefined();
    expect(normalizeMaxDebuglogSize(null))
      .toBeUndefined();
  });
});

describe('normalizeBlockId (mssanitizer range 0..200)', () => {
  it('keeps in-range ids including the 0 and 200 boundaries', () => {
    expect(normalizeBlockId(0))
      .toBe(0);
    expect(normalizeBlockId(200))
      .toBe(200);
    expect(normalizeBlockId('17'))
      .toBe(17);
  });

  it('drops out-of-range and non-numeric ids', () => {
    expect(normalizeBlockId(-1))
      .toBeUndefined();
    expect(normalizeBlockId(201))
      .toBeUndefined();
    expect(normalizeBlockId(''))
      .toBeUndefined();
    expect(normalizeBlockId(undefined))
      .toBeUndefined();
    expect(normalizeBlockId(null))
      .toBeUndefined();
  });
});

describe('normalizeLogLevel (mssanitizer info|warn|error)', () => {
  it('keeps a valid level', () => {
    expect(normalizeLogLevel('info'))
      .toBe('info');
    expect(normalizeLogLevel('warn'))
      .toBe('warn');
    expect(normalizeLogLevel('error'))
      .toBe('error');
  });

  it('drops unknown levels and nullish', () => {
    expect(normalizeLogLevel('verbose'))
      .toBeUndefined();
    expect(normalizeLogLevel(''))
      .toBeUndefined();
    expect(normalizeLogLevel(undefined))
      .toBeUndefined();
  });
});

describe('normalizeSanitizerTools (mssanitizer memcheck|racecheck|initcheck|synccheck)', () => {
  it('keeps the valid tools', () => {
    expect(normalizeSanitizerTools([
      'memcheck',
      'racecheck',
      'initcheck',
      'synccheck',
    ]))
      .toEqual([
        'memcheck',
        'racecheck',
        'initcheck',
        'synccheck',
      ]);
  });

  it('drops unknown tool names', () => {
    expect(normalizeSanitizerTools([
      'memcheck',
      'bogus',
      'racecheck',
    ]))
      .toEqual([
        'memcheck',
        'racecheck',
      ]);
  });

  it('returns an empty array for no valid tools', () => {
    expect(normalizeSanitizerTools(['bogus']))
      .toEqual([]);
    expect(normalizeSanitizerTools([]))
      .toEqual([]);
  });
});

describe('normalizeNpuSanitizerTools (npu-check tool allow-list)', () => {
  it('keeps all supported npu-check tools', () => {
    expect(normalizeNpuSanitizerTools([
      'memcheck',
      'synccheck',
      'racecheck',
      'initcheck',
      'soccheck',
      'overcheck',
    ]))
      .toEqual([
        'memcheck',
        'synccheck',
      ]);
  });

  it('drops unsupported npu-check tool names', () => {
    expect(normalizeNpuSanitizerTools([
      'memcheck',
      'leak-check',
      'soccheck',
      'bogus',
      'overcheck',
    ]))
      .toEqual(['memcheck']);
  });
});

describe('normalizeSanitizerCommand', () => {
  it('keeps supported command names', () => {
    expect(normalizeSanitizerCommand('mssanitizer'))
      .toBe('mssanitizer');
    expect(normalizeSanitizerCommand('npu-check'))
      .toBe('npu-check');
  });

  it('defaults unknown command names to mssanitizer', () => {
    expect(normalizeSanitizerCommand('unknown'))
      .toBe('mssanitizer');
    expect(normalizeSanitizerCommand(undefined))
      .toBe('mssanitizer');
  });
});

describe('buildSanitizerLogFileName', () => {
  it('uses the npu-check_<timestamp> name for npu-check', () => {
    expect(buildSanitizerLogFileName('npu-check'))
      .toMatch(/^npu-check_\d+\.log$/);
  });

  it('keeps the legacy name for mssanitizer', () => {
    expect(buildSanitizerLogFileName('mssanitizer'))
      .toMatch(/^mssanitizer_\d+\.log$/);
  });
});

describe('getSanitizerLogDirName', () => {
  it('routes npu-check reports to the npu-check-log directory', () => {
    expect(getSanitizerLogDirName('npu-check'))
      .toBe('npu-check-log');
  });

  it('keeps mssanitizer reports in mindstudio_sanitizer_log', () => {
    expect(getSanitizerLogDirName('mssanitizer'))
      .toBe('mindstudio_sanitizer_log');
  });

  it('exposes both reader directories', () => {
    expect(SANITIZER_LOG_DIR_NAMES)
      .toEqual(expect.arrayContaining([
        'mindstudio_sanitizer_log',
        'npu-check-log',
      ]));
  });
});

describe('buildSanitizerLogFilePath', () => {
  it('places the npu-check log file inside npu-check-log', () => {
    const filePath = buildSanitizerLogFilePath('/ws', 'npu-check');

    expect(filePath)
      .toContain('npu-check-log');
    expect(filePath)
      .toMatch(/npu-check_\d+\.log$/);
    expect(filePath)
      .not
      .toContain('mindstudio_sanitizer_log');
  });

  it('keeps the mssanitizer log file inside mindstudio_sanitizer_log', () => {
    const filePath = buildSanitizerLogFilePath('/ws', 'mssanitizer');

    expect(filePath)
      .toContain('mindstudio_sanitizer_log');
    expect(filePath)
      .toMatch(/mssanitizer_\d+\.log$/);
    expect(filePath)
      .not
      .toContain('npu-check-log');
  });
});

describe('createSanitizerCommand', () => {
  it('renders npu-check options as space-separated flags', () => {
    const cmd = createSanitizerCommand('npu-check')
      .addOption('tool', [
        'memcheck',
        'synccheck',
      ])
      .addOption('log-file', '/ws/.vscode/npu-check-log/npu-check_1.log');

    expect(cmd.toString())
      .toBe('npu-check --tool memcheck --tool synccheck --log-file /ws/.vscode/npu-check-log/npu-check_1.log');
  });

  it('renders mssanitizer options with the --key=value form', () => {
    const cmd = createSanitizerCommand('mssanitizer')
      .addOption('tool', 'memcheck')
      .addOption('log-level', 'warn');

    expect(cmd.toString())
      .toBe('mssanitizer --tool=memcheck --log-level=warn');
  });
});
