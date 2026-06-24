import fs from 'fs-extra';
import os from 'os';
import path from 'path';

import {
  findNewestTritonKernelObject,
  isTritonKernelArtifact,
  readTritonKernelPathSidecar,
  resolveTritonLaunchKernelPath,
  TRITON_LAUNCH_KERNEL_PATH_SIDECAR,
  tritonOperatorStemFromScriptArg,
  writeTritonKernelPathSidecar,
} from '@plugin/domain/utils/triton-kernel-path';

describe('isTritonKernelArtifact', () => {
  it('accepts npubin and legacy kernel object names', () => {
    expect(isTritonKernelArtifact('add_kernel.npubin'))
      .toBe(true);
    expect(isTritonKernelArtifact('kernel.o'))
      .toBe(true);
    expect(isTritonKernelArtifact('kernel_reloc.o'))
      .toBe(true);
  });

  it('rejects mlir bytecode', () => {
    expect(isTritonKernelArtifact('kernel.mlirbc'))
      .toBe(false);
  });
});

describe('tritonOperatorStemFromScriptArg', () => {
  it('derives stem from script arg', () => {
    expect(tritonOperatorStemFromScriptArg('./add_kernel.py'))
      .toBe('add_kernel');
  });
});

describe('findNewestTritonKernelObject', () => {
  let cacheRoot: string;

  beforeEach(async () => {
    cacheRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'triton-cache-test-'));
  });

  afterEach(async () => {
    await fs.remove(cacheRoot);
  });

  it('returns the newest kernel.o under the cache tree', async () => {
    const olderDir = path.join(cacheRoot, 'aaa');
    const newerDir = path.join(cacheRoot, 'bbb');

    await fs.ensureDir(olderDir);
    await fs.ensureDir(newerDir);

    const olderFile = path.join(olderDir, 'kernel.o');
    const newerFile = path.join(newerDir, 'kernel_reloc.o');

    await fs.writeFile(olderFile, 'old');
    await fs.writeFile(newerFile, 'new');

    const olderTime = new Date('2020-01-01');
    const newerTime = new Date('2025-01-01');

    await fs.utimes(olderFile, olderTime, olderTime);
    await fs.utimes(newerFile, newerTime, newerTime);

    expect(findNewestTritonKernelObject(cacheRoot))
      .toBe(newerFile);
  });

  it('returns the newest npubin when only npubin files exist', async () => {
    const olderDir = path.join(cacheRoot, 'aaa');
    const newerDir = path.join(cacheRoot, 'bbb');

    await fs.ensureDir(olderDir);
    await fs.ensureDir(newerDir);

    const olderFile = path.join(olderDir, 'add_kernel.npubin');
    const newerFile = path.join(newerDir, 'other_kernel.npubin');

    await fs.writeFile(olderFile, 'old');
    await fs.writeFile(newerFile, 'new');

    const olderTime = new Date('2020-01-01');
    const newerTime = new Date('2025-01-01');

    await fs.utimes(olderFile, olderTime, olderTime);
    await fs.utimes(newerFile, newerTime, newerTime);

    expect(findNewestTritonKernelObject(cacheRoot))
      .toBe(newerFile);
  });

  it('prefers operator stem match over newer unrelated npubin', async () => {
    const stemDir = path.join(cacheRoot, 'stem');
    const otherDir = path.join(cacheRoot, 'other');

    await fs.ensureDir(stemDir);
    await fs.ensureDir(otherDir);

    const stemFile = path.join(stemDir, 'add_kernel.npubin');
    const otherFile = path.join(otherDir, 'other_kernel.npubin');

    await fs.writeFile(stemFile, 'stem');
    await fs.writeFile(otherFile, 'other');

    const olderTime = new Date('2020-01-01');
    const newerTime = new Date('2025-01-01');

    await fs.utimes(stemFile, olderTime, olderTime);
    await fs.utimes(otherFile, newerTime, newerTime);

    expect(findNewestTritonKernelObject(cacheRoot, 'add_kernel'))
      .toBe(stemFile);
  });

  it('falls back to global newest when stem has no match', async () => {
    const dir = path.join(cacheRoot, 'only');

    await fs.ensureDir(dir);

    const onlyFile = path.join(dir, 'other_kernel.npubin');

    await fs.writeFile(onlyFile, 'only');

    expect(findNewestTritonKernelObject(cacheRoot, 'add_kernel'))
      .toBe(onlyFile);
  });

  it('returns undefined when the cache directory is missing', () => {
    expect(findNewestTritonKernelObject(path.join(cacheRoot, 'missing')))
      .toBeUndefined();
  });
});

describe('resolveTritonLaunchKernelPath', () => {
  let workspaceRoot: string;

  beforeEach(async () => {
    workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'triton-sidecar-'));
    await fs.ensureDir(path.join(workspaceRoot, '.vscode'));
  });

  afterEach(async () => {
    await fs.remove(workspaceRoot);
  });

  it('prefers sidecar over cache heuristic', async () => {
    const sidecarKernel = path.join(workspaceRoot, 'from-sidecar.npubin');

    await fs.writeFile(sidecarKernel, 'sidecar');
    await writeTritonKernelPathSidecar(workspaceRoot, sidecarKernel);

    expect(resolveTritonLaunchKernelPath(workspaceRoot, 'add_kernel'))
      .toBe(sidecarKernel);
  });

  it('resolves npubin via operator stem when sidecar is absent', async () => {
    const cacheRoot = path.join(workspaceRoot, 'fake-cache');
    const kernelFile = path.join(cacheRoot, 'hash', 'add_kernel.npubin');

    await fs.ensureDir(path.dirname(kernelFile));
    await fs.writeFile(kernelFile, 'elf');

    const originalHomedir = os.homedir;

    os.homedir = () => workspaceRoot;

    try {
      await fs.ensureDir(path.join(workspaceRoot, '.triton', 'cache'));
      await fs.copy(cacheRoot, path.join(workspaceRoot, '.triton', 'cache'), { overwrite: true });

      expect(resolveTritonLaunchKernelPath(workspaceRoot, 'add_kernel'))
        .toBe(path.join(workspaceRoot, '.triton', 'cache', 'hash', 'add_kernel.npubin'));
    }
    finally {
      os.homedir = originalHomedir;
    }
  });

  it('readTritonKernelPathSidecar ignores missing kernel paths', async () => {
    const sidecarPath = path.join(workspaceRoot, '.vscode', TRITON_LAUNCH_KERNEL_PATH_SIDECAR);

    await fs.writeFile(sidecarPath, '/no/such/kernel.o\n');

    expect(readTritonKernelPathSidecar(workspaceRoot))
      .toBeUndefined();
  });
});
