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
    expect(tritonOperatorStemFromScriptArg('/abs/path/run.py'))
      .toBe('run');
  });

  it('returns undefined for non-py script args', () => {
    expect(tritonOperatorStemFromScriptArg('./add_kernel'))
      .toBeUndefined();
    expect(tritonOperatorStemFromScriptArg('kernel.pyc'))
      .toBeUndefined();
  });

  it('returns undefined for the bare .py stem', () => {
    expect(tritonOperatorStemFromScriptArg('.py'))
      .toBeUndefined();
  });
});

describe('findNewestTritonKernelObject', () => {
  let cacheRoot: string;

  beforeEach(async () => {
    cacheRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'triton-cache-test-'));
  });

  afterEach(async () => {
    jest.restoreAllMocks();
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

  it('returns undefined for an existing but empty cache tree', () => {
    fs.ensureDirSync(path.join(cacheRoot, 'empty-sub'));

    expect(findNewestTritonKernelObject(cacheRoot))
      .toBeUndefined();
  });

  it('matches stems with a dot prefix (add_kernel.v2.npubin)', async () => {
    const dir = path.join(cacheRoot, 'd');

    await fs.ensureDir(dir);

    const stemFile = path.join(dir, 'add_kernel.v2.npubin');
    const otherFile = path.join(dir, 'zzz.npubin');

    await fs.writeFile(stemFile, 'stem');
    await fs.writeFile(otherFile, 'other');

    const old = new Date('2020-01-01');
    const recent = new Date('2025-01-01');

    await fs.utimes(stemFile, old, old);
    await fs.utimes(otherFile, recent, recent);

    expect(findNewestTritonKernelObject(cacheRoot, 'add_kernel'))
      .toBe(stemFile);
  });

  it('matches stems with an underscore suffix (add_kernel_v2.npubin)', async () => {
    const dir = path.join(cacheRoot, 'd');

    await fs.ensureDir(dir);

    const stemFile = path.join(dir, 'add_kernel_v2.npubin');

    await fs.writeFile(stemFile, 'stem');

    expect(findNewestTritonKernelObject(cacheRoot, 'add_kernel'))
      .toBe(stemFile);
  });

  it('keeps the newest candidate regardless of traversal order', async () => {
    const newerFile = path.join(cacheRoot, 'newer.npubin');
    const olderFile = path.join(cacheRoot, 'older.npubin');

    await fs.writeFile(newerFile, 'newer');
    await fs.writeFile(olderFile, 'older');

    const olderTime = new Date('2020-01-01');
    const newerTime = new Date('2025-01-01');

    await fs.utimes(newerFile, newerTime, newerTime);
    await fs.utimes(olderFile, olderTime, olderTime);

    // Force the newest file to be visited first so the reduce must keep it.
    const makeEntry = (name: string): fs.Dirent => ({
      name,
      isDirectory: () => false,
      isFile: () => true,
      isSymbolicLink: () => false,
      isBlockDevice: () => false,
      isCharacterDevice: () => false,
      isFIFO: () => false,
      isSocket: () => false,
    } as fs.Dirent);

    const realReaddir = fs.readdirSync.bind(fs);

    jest.spyOn(fs, 'readdirSync')
      .mockImplementation((((dir: string, ...rest: unknown[]) => {
        if (dir === cacheRoot) {
          return [
            makeEntry('newer.npubin'),
            makeEntry('older.npubin'),
          ] as fs.Dirent[];
        }

        return realReaddir(dir, ...rest as []);
      }) as typeof fs.readdirSync));

    expect(findNewestTritonKernelObject(cacheRoot))
      .toBe(newerFile);
  });

  it('skips artifacts that only share a prefix but are not kernel artifacts', async () => {
    const dir = path.join(cacheRoot, 'd');

    await fs.ensureDir(dir);

    const stemFile = path.join(dir, 'add_kernel_v2.mlirbc');

    await fs.writeFile(stemFile, 'bytecode');

    expect(findNewestTritonKernelObject(cacheRoot, 'add_kernel'))
      .toBeUndefined();
  });

  it('keeps scanning when a subdirectory read fails', async () => {
    const goodDir = path.join(cacheRoot, 'good');
    const brokenDir = path.join(cacheRoot, 'broken');

    await fs.ensureDir(goodDir);
    await fs.ensureDir(brokenDir);

    const goodFile = path.join(goodDir, 'ok.npubin');

    await fs.writeFile(goodFile, 'ok');

    const realReaddir = fs.readdirSync.bind(fs);

    jest.spyOn(fs, 'readdirSync')
      .mockImplementation((((dir: string, ...rest: unknown[]) => {
        if (dir === brokenDir) {
          throw new Error('EACCES');
        }

        return realReaddir(dir, ...rest as []);
      }) as typeof fs.readdirSync));

    expect(findNewestTritonKernelObject(cacheRoot))
      .toBe(goodFile);
  });

  it('skips files whose stat fails', async () => {
    const dir = path.join(cacheRoot, 'd');

    await fs.ensureDir(dir);

    const brokenFile = path.join(dir, 'broken.npubin');
    const goodFile = path.join(dir, 'ok.npubin');

    await fs.writeFile(brokenFile, 'broken');
    await fs.writeFile(goodFile, 'ok');

    const realStat = fs.statSync.bind(fs);

    jest.spyOn(fs, 'statSync')
      .mockImplementation((((target: string, ...rest: unknown[]) => {
        if (target === brokenFile) {
          throw new Error('EACCES');
        }

        return realStat(target, ...rest as []);
      }) as typeof fs.statSync));

    expect(findNewestTritonKernelObject(cacheRoot))
      .toBe(goodFile);
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

  it('readTritonKernelPathSidecar ignores a whitespace-only sidecar', async () => {
    const sidecarPath = path.join(workspaceRoot, '.vscode', TRITON_LAUNCH_KERNEL_PATH_SIDECAR);

    await fs.writeFile(sidecarPath, '   \n\t');

    expect(readTritonKernelPathSidecar(workspaceRoot))
      .toBeUndefined();
  });

  it('writeTritonKernelPathSidecar creates the ide dir and writes the path', async () => {
    const sidecarPath = path.join(workspaceRoot, '.vscode', TRITON_LAUNCH_KERNEL_PATH_SIDECAR);
    const kernel = path.join(workspaceRoot, 'kernel.npubin');

    await fs.writeFile(kernel, 'elf');

    await writeTritonKernelPathSidecar(workspaceRoot, kernel);

    expect(await fs.readFile(sidecarPath, 'utf-8'))
      .toBe(`${kernel}\n`);
  });
});
