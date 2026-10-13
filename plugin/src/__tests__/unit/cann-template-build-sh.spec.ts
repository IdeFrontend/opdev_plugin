/**
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 * This program is free software, you can redistribute it and/or modify it under the terms and conditions of
 * CANN Open Software License Agreement Version 2.0 (the "License").
 * Please refer to the License for details. You may not use this file except in compliance with the License.
 * THIS SOFTWARE IS PROVIDED ON AN "AS IS" BASIS, WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED,
 * INCLUDING BUT NOT LIMITED TO NON-INFRINGEMENT, MERCHANTABILITY, OR FITNESS FOR A PARTICULAR PURPOSE.
 * See LICENSE in the root of the software repository for the full text of the License.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const PROBE_TIMEOUT_MS = 5_000;
const SCRIPT_TIMEOUT_MS = 5_000;
const POSIX_BASH_PATHS = [
  '/bin/bash',
  '/usr/bin/bash',
] as const;
const templateRoot = path.resolve(__dirname, '../../../templates/code_template/cann_template');

interface ScriptResult {
  status: number | null;
  error?: Error;
  stderr: string;
  cmakeArgv?: string[];
}

function resolveApprovedBash(candidate: string): string | undefined {
  if (!path.isAbsolute(candidate) || !fs.existsSync(candidate)) {
    return undefined;
  }

  const resolved = fs.realpathSync(candidate);

  if (process.platform === 'win32') {
    return /[\\/]Git[\\/](?:bin|usr[\\/]bin)[\\/]bash\.exe$/i.test(resolved)
      ? resolved
      : undefined;
  }

  const approved = POSIX_BASH_PATHS
    .filter((bashPath) => fs.existsSync(bashPath))
    .map((bashPath) => fs.realpathSync(bashPath));

  return approved.includes(resolved) ? resolved : undefined;
}

function resolveConfiguredBash(candidate: string): string | undefined {
  return path.isAbsolute(candidate) && fs.existsSync(candidate)
    ? fs.realpathSync(candidate)
    : undefined;
}

function bashCandidates(): string[] {
  if (process.env.MSTT_TEST_BASH) {
    const configured = resolveConfiguredBash(process.env.MSTT_TEST_BASH);

    if (!configured) {
      throw new Error('MSTT_TEST_BASH must resolve to an existing absolute Bash path');
    }

    return [configured];
  }

  const candidates = process.platform === 'win32'
    ? [
      process.env.ProgramFiles && path.join(process.env.ProgramFiles, 'Git', 'bin', 'bash.exe'),
      process.env.ProgramW6432 && path.join(process.env.ProgramW6432, 'Git', 'bin', 'bash.exe'),
      process.env['ProgramFiles(x86)'] && path.join(process.env['ProgramFiles(x86)'], 'Git', 'bin', 'bash.exe'),
      process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Programs', 'Git', 'bin', 'bash.exe'),
    ]
    : [...POSIX_BASH_PATHS];

  return [
    ...new Set(candidates
      .filter((candidate): candidate is string => Boolean(candidate))
      .map(resolveApprovedBash)
      .filter((candidate): candidate is string => Boolean(candidate))),
  ];
}

function selectBashExecutable(): string {
  const failures: string[] = [];

  for (const candidate of bashCandidates()) {
    const probe = spawnSync(candidate, ['--version'], {
      encoding: 'utf8',
      timeout: PROBE_TIMEOUT_MS,
    });

    const versionOutput = `${probe.stdout || ''}\n${probe.stderr || ''}`;

    if (!probe.error && probe.status === 0 && /GNU bash/i.test(versionOutput)) {
      return candidate;
    }

    failures.push(`${candidate}: ${probe.error?.message || `exit ${probe.status}`}`);
  }

  throw new Error(`No usable approved Bash found (${failures.join('; ')})`);
}

const bashExecutable = selectBashExecutable();

function decodeCapturedArgv(content: Buffer): string[] {
  if (content.length === 0) {
    return [];
  }

  const values = content.toString('utf8')
    .split('\0');

  if (values[values.length - 1] === '') {
    values.pop();
  }

  return values;
}

function writeStub(file: string, body: string): void {
  fs.writeFileSync(file, body, 'utf8');
  fs.chmodSync(file, 0o755);
}

function runBuildScript(sourceScript: string, args: string[]): ScriptResult {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mstt-cann-build-sh-'));
  const script = path.join(tempRoot, 'build.sh');
  const binDir = path.join(tempRoot, 'bin');
  const captureFile = path.join(tempRoot, 'cmake-argv.bin');

  try {
    fs.copyFileSync(sourceScript, script);
    fs.mkdirSync(binDir);
    writeStub(
      path.join(binDir, 'cmake'),
      '#!/bin/bash\n: > "$CAPTURE_FILE"\nfor arg in "$@"; do printf "%s\\0" "$arg" >> "$CAPTURE_FILE"; done\n',
    );
    writeStub(path.join(binDir, 'make'), '#!/bin/bash\nexit 0\n');

    const result = spawnSync(bashExecutable, [
      'build.sh',
      ...args,
    ], {
      cwd: tempRoot,
      encoding: 'utf8',
      env: {
        ...process.env,
        ASCEND_HOME_PATH: '/toolkit',
        CAPTURE_FILE: '../cmake-argv.bin',
        NPU_ARCH: 'dav-2201',
        PATH: '../bin:/usr/bin:/bin',
        SOC_VERSION: 'EnvSoc',
      },
      timeout: SCRIPT_TIMEOUT_MS,
    });

    return {
      status: result.status,
      error: result.error,
      stderr: result.stderr,
      cmakeArgv: fs.existsSync(captureFile)
        ? decodeCapturedArgv(fs.readFileSync(captureFile))
        : undefined,
    };
  }
  finally {
    fs.rmSync(tempRoot, {
      recursive: true,
      force: true,
    });
  }
}

const templateScripts = fs.readdirSync(templateRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => ({
    name: entry.name,
    script: path.join(templateRoot, entry.name, 'build.sh'),
  }))
  .filter(({ script }) => fs.existsSync(script));

if (templateScripts.length === 0) {
  throw new Error(`No CANN build.sh templates found under ${templateRoot}`);
}

describe('CANN template build.sh parser harness', () => {
  it('uses one approved absolute Bash for probe and execution', () => {
    expect(path.isAbsolute(bashExecutable))
      .toBe(true);
  });

  it('preserves empty captured argv entries', () => {
    expect(decodeCapturedArgv(Buffer.from('first\0\0third\0')))
      .toEqual([
        'first',
        '',
        'third',
      ]);
  });
});

describe.each(templateScripts)('$name build.sh parser', ({ script }) => {
  it('composes modes and the equals build-type syntax', () => {
    const result = runBuildScript(script, [
      '--debug',
      'unknown',
      '--mssanitizer',
      '--build-type=Debug',
      '--onboard',
    ]);

    expect(result.error)
      .toBeUndefined();
    expect(result.status)
      .toBe(0);
    expect(result.cmakeArgv)
      .toEqual([
        '..',
        '-DENABLE_DEBUG=ON',
        '-DENABLE_MS_SANITIZER=ON',
        '-DENABLE_ON_BOARD=ON',
        '-DCMAKE_BUILD_TYPE=Debug',
      ]);
  });

  it('keeps parsing after unknown and empty args with separate build type', () => {
    const scriptSource = fs.readFileSync(script, 'utf8');
    const usesAscRunModeSim = scriptSource.includes('CMAKE_ASC_RUN_MODE=sim');

    // ASC_RUN_MODE templates break after --simulator (mutual-exclusive mode), so
    // --build-type must appear before it. ENABLE_SIMULATOR templates keep parsing
    // and accept an optional SOC_VERSION positional after --simulator.
    const result = runBuildScript(script, usesAscRunModeSim
      ? [
        'unknown',
        '',
        '--build-type',
        'Release',
        '--simulator',
        'Ascend910B3',
        '--later',
      ]
      : [
        'unknown',
        '',
        '--simulator',
        'Ascend910B3',
        '--later',
        '--build-type',
        'Release',
      ]);

    expect(result.error)
      .toBeUndefined();
    expect(result.status)
      .toBe(0);
    expect(result.cmakeArgv)
      .toEqual(usesAscRunModeSim
        ? [
          '..',
          '-DCMAKE_ASC_RUN_MODE=sim',
          '-DCMAKE_ASC_ARCHITECTURES=dav-2201',
          '-DNPU_ARCH=dav-2201',
          '-DCMAKE_BUILD_TYPE=Release',
        ]
        : [
          '..',
          '-DENABLE_SIMULATOR=ON',
          '-DASCEND_HOME_PATH=/toolkit',
          '-DSOC_VERSION=Ascend910B3',
          '-DCMAKE_BUILD_TYPE=Release',
        ]);
  });

  it('honors -- as the end of supported options', () => {
    const result = runBuildScript(script, [
      '--debug',
      '--',
      '--build-type=Release',
      '--onboard',
    ]);

    expect(result.error)
      .toBeUndefined();
    expect(result.status)
      .toBe(0);
    expect(result.cmakeArgv)
      .toEqual([
        '..',
        '-DENABLE_DEBUG=ON',
      ]);
  });

  it('does not pass an empty CMake argument when no option is selected', () => {
    const result = runBuildScript(script, []);

    expect(result.error)
      .toBeUndefined();
    expect(result.status)
      .toBe(0);
    expect(result.cmakeArgv)
      .toEqual(['..']);
  });

  it.each([
    ['--build-type='],
    ['--build-type'],
    [
      '--build-type',
      '',
    ],
    [
      '--build-type',
      '--debug',
    ],
    ['--build-type=-Debug'],
    [
      '--build-type=Debug',
      '--build-type',
      'Release',
    ],
  ])('rejects invalid or repeated build type: %j', (...args) => {
    const result = runBuildScript(script, args);

    expect(result.error)
      .toBeUndefined();
    expect(result.status).not.toBe(0);
    expect(result.stderr)
      .toContain('--build-type');
    expect(result.cmakeArgv)
      .toBeUndefined();
  });
});
