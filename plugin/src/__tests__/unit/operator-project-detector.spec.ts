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

jest.mock('@plugin/domain/plugins/operator-plugin.registry', () => ({ OperatorPluginRegistry: { detectProject: jest.fn() } }));

import { OperatorPluginRegistry } from '@plugin/domain/plugins/operator-plugin.registry';
import {
  OperatorProjectDetector,
  OperatorProjectType,
} from '@plugin/domain/services/operator-project-detector';

const detectProject = OperatorPluginRegistry.detectProject as jest.Mock;

const tmpRoots: string[] = [];

function mkTmp(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'opd-'));

  tmpRoots.push(dir);

  return dir;
}

afterEach(() => {
  while (tmpRoots.length > 0) {
    const dir = tmpRoots.pop();

    fs.rmSync(dir, {
      recursive: true,
      force: true,
    });
  }
});

describe('OperatorProjectDetector.detectOperatorProject', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('reports a directory that no detector matches', async () => {
    detectProject.mockResolvedValueOnce(null);

    const result = await OperatorProjectDetector.detectOperatorProject('/repo/plain');

    expect(result)
      .toEqual({
        isOperatorProject: false,
        projectPath: '/repo/plain',
        projectName: 'plain',
      });
  });

  it('reports the detected project type', async () => {
    detectProject.mockResolvedValueOnce({
      detector: {},
      projectType: OperatorProjectType.STANDARD_CUSTOM,
    });

    const result = await OperatorProjectDetector.detectOperatorProject('/repo/math');

    expect(result)
      .toEqual({
        isOperatorProject: true,
        projectType: OperatorProjectType.STANDARD_CUSTOM,
        projectPath: '/repo/math',
        projectName: 'math',
      });
  });
});

describe('OperatorProjectDetector.scanForOperatorProjects', () => {
  let tmpRoot: string;

  beforeEach(() => {
    jest.clearAllMocks();
    tmpRoot = mkTmp();
  });

  it('stops at a directory that is itself an operator project', async () => {
    detectProject.mockImplementation(async (dirPath: string) =>
      dirPath === tmpRoot ? { projectType: OperatorProjectType.PYASC } : null);

    const results = await OperatorProjectDetector.scanForOperatorProjects(tmpRoot);

    expect(results)
      .toEqual([
        {
          isOperatorProject: true,
          projectType: OperatorProjectType.PYASC,
          projectPath: tmpRoot,
          projectName: path.basename(tmpRoot),
        },
      ]);
    expect(detectProject)
      .toHaveBeenCalledTimes(1);
  });

  it('finds an operator project one level deep and skips filtered directories', async () => {
    const projectDir = path.join(tmpRoot, 'math');

    fs.mkdirSync(projectDir);
    fs.mkdirSync(path.join(tmpRoot, 'node_modules'));
    fs.mkdirSync(path.join(tmpRoot, '.git'));
    fs.mkdirSync(path.join(tmpRoot, 'out'));
    fs.mkdirSync(path.join(tmpRoot, 'build'));
    fs.writeFileSync(path.join(tmpRoot, 'readme.txt'), '');
    detectProject.mockImplementation(async (dirPath: string) =>
      dirPath === projectDir ? { projectType: OperatorProjectType.ASCEND_C } : null);

    const results = await OperatorProjectDetector.scanForOperatorProjects(tmpRoot, 3);

    expect(results)
      .toEqual([
        {
          isOperatorProject: true,
          projectType: OperatorProjectType.ASCEND_C,
          projectPath: projectDir,
          projectName: 'math',
        },
      ]);
    const scannedPaths = detectProject.mock.calls.map((call) => call[0]);

    expect(scannedPaths).not.toContain(path.join(tmpRoot, 'node_modules'));
    expect(scannedPaths).not.toContain(path.join(tmpRoot, '.git'));
    expect(scannedPaths).not.toContain(path.join(tmpRoot, 'out'));
    expect(scannedPaths).not.toContain(path.join(tmpRoot, 'build'));
    expect(scannedPaths).not.toContain(path.join(tmpRoot, 'readme.txt'));
  });

  it('respects maxDepth and stops descending past it', async () => {
    const depth4 = path.join(tmpRoot, 'a', 'b', 'c', 'd');

    fs.mkdirSync(depth4, { recursive: true });
    detectProject.mockImplementation(async (dirPath: string) =>
      dirPath === depth4 ? { projectType: OperatorProjectType.TRITON } : null);

    const shallow = await OperatorProjectDetector.scanForOperatorProjects(tmpRoot, 3);

    expect(shallow)
      .toEqual([]);
    expect(detectProject.mock.calls.map((call) => call[0]))
      .not.toContain(depth4);

    detectProject.mockClear();
    const deep = await OperatorProjectDetector.scanForOperatorProjects(tmpRoot, 4);

    expect(deep)
      .toHaveLength(1);
    expect(deep[0].projectPath)
      .toBe(depth4);
  });

  it('ignores detection failures and keeps scanning other branches', async () => {
    const goodDir = path.join(tmpRoot, 'good');

    fs.mkdirSync(path.join(tmpRoot, 'bad'));
    fs.mkdirSync(goodDir);
    detectProject.mockImplementation(async (dirPath: string) => {
      if (dirPath === path.join(tmpRoot, 'bad')) {
        throw new Error('boom');
      }

      return dirPath === goodDir ? { projectType: OperatorProjectType.STANDARD_CUSTOM } : null;
    });

    const results = await OperatorProjectDetector.scanForOperatorProjects(tmpRoot);

    expect(results)
      .toEqual([expect.objectContaining({ projectPath: goodDir })]);
  });

  it('defaults maxDepth to 3', async () => {
    const results = await OperatorProjectDetector.scanForOperatorProjects(tmpRoot);

    expect(results)
      .toEqual([]);
    expect(detectProject)
      .toHaveBeenCalledWith(tmpRoot);
  });
});

describe('OperatorProjectDetector.scanForStandardCustomOperatorProjects', () => {
  let tmpRoot: string;

  beforeEach(() => {
    tmpRoot = mkTmp();
  });

  it('collects first-level folders that contain CMakeLists.txt', async () => {
    fs.mkdirSync(path.join(tmpRoot, 'add'));
    fs.writeFileSync(path.join(tmpRoot, 'add', 'CMakeLists.txt'), '');
    fs.mkdirSync(path.join(tmpRoot, 'mul'));
    fs.mkdirSync(path.join(tmpRoot, 'empty'));

    const results = await OperatorProjectDetector.scanForStandardCustomOperatorProjects(tmpRoot);

    expect(results)
      .toEqual([
        {
          isOperatorProject: true,
          projectType: OperatorProjectType.STANDARD_CUSTOM,
          projectPath: path.join(tmpRoot, 'add'),
          projectName: 'add',
        },
      ]);
  });

  it('skips files, dot-directories and tool output directories', async () => {
    fs.writeFileSync(path.join(tmpRoot, 'file.txt'), '');

    for (const name of [
      '.hidden',
      'node_modules',
      'out',
      'build',
    ]) {
      fs.mkdirSync(path.join(tmpRoot, name));
      fs.writeFileSync(path.join(tmpRoot, name, 'CMakeLists.txt'), '');
    }

    const results = await OperatorProjectDetector.scanForStandardCustomOperatorProjects(tmpRoot);

    expect(results)
      .toEqual([]);
  });

  it('returns an empty list when the root cannot be read', async () => {
    const filePath = path.join(tmpRoot, 'not-a-dir');

    fs.writeFileSync(filePath, '');

    await expect(OperatorProjectDetector.scanForStandardCustomOperatorProjects(filePath))
      .resolves.toEqual([]);
  });
});
