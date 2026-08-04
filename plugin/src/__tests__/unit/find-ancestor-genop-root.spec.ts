import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { EventEmitter } from 'events';
import {
  spawn, spawnSync,
} from 'child_process';
import {
  buildShHelpSupportsGenop,
  buildShHelpSupportsOptionSync,
  findAncestorGenopCollectionRoot,
  helpOutputSupportsGenop,
  helpOutputSupportsOption,
  hasAncestorBuildShWithGenop,
} from '@plugin/domain/plugins/detection-utils';

jest.mock('child_process', () => ({
  spawn: jest.fn(),
  spawnSync: jest.fn(),
}));

function mkTmp(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'genop-root-'));
}

describe('findAncestorGenopCollectionRoot', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('recognizes --genop and --genop= in build.sh help output only', () => {
    expect(helpOutputSupportsGenop('Usage: build.sh --genop=PATH'))
      .toBe(true);
    expect(helpOutputSupportsGenop('  --genop <path>'))
      .toBe(true);
    expect(helpOutputSupportsGenop('  --genop-old <path>'))
      .toBe(false);
  });

  it('recognizes an exact long option in build.sh help output', () => {
    expect(helpOutputSupportsOption('  --bisheng_flags=value', '--bisheng_flags'))
      .toBe(true);
    expect(helpOutputSupportsOption('  --bisheng_flags-old', '--bisheng_flags'))
      .toBe(false);
  });

  it('runs build.sh --help for the synchronous configuration capability check', () => {
    const root = mkTmp();

    fs.writeFileSync(path.join(root, 'build.sh'), '#!/bin/bash\n');
    (spawnSync as jest.Mock).mockReturnValue({
      stdout: '',
      stderr: 'Usage: build.sh --bisheng_flags=<flags>',
    });

    expect(buildShHelpSupportsOptionSync(root, '--bisheng_flags'))
      .toBe(true);
    expect(spawnSync)
      .toHaveBeenCalledWith('bash', [
        'build.sh',
        '--help',
      ], expect.objectContaining({
        cwd: root,
        shell: false,
        windowsHide: true,
      }));
  });

  it('runs build.sh --help in the project directory and reads its output', async () => {
    const root = mkTmp();
    const child = new EventEmitter() as EventEmitter & {
      kill: jest.Mock;
      stderr: EventEmitter;
      stdout: EventEmitter;
    };

    fs.writeFileSync(path.join(root, 'build.sh'), '#!/bin/bash\n');
    child.kill = jest.fn();
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    (spawn as jest.Mock).mockImplementation(() => {
      process.nextTick(() => {
        child.stderr.emit('data', Buffer.from('Usage: build.sh --genop=PATH'));
        child.emit('close', 1);
      });

      return child;
    });

    await expect(buildShHelpSupportsGenop(root))
      .resolves.toBe(true);
    expect(spawn)
      .toHaveBeenCalledWith('bash', [
        'build.sh',
        '--help',
      ], {
        cwd: root,
        shell: false,
        windowsHide: true,
      });
  });

  it('returns the collection root for a direct sub-operator', async () => {
    const root = mkTmp();

    fs.writeFileSync(path.join(root, 'build.sh'), '#!/bin/bash\n./x.sh --genop\n');
    const sub = path.join(root, 'add');

    fs.mkdirSync(sub);
    await expect(findAncestorGenopCollectionRoot(sub, async (dirPath) => dirPath === root))
      .resolves.toBe(root);
  });

  it('returns the collection root for an experimental sub-operator (2 levels up)', async () => {
    const root = mkTmp();

    fs.writeFileSync(path.join(root, 'build.sh'), '#!/bin/bash\n./x.sh --genop\n');
    const exp = path.join(root, 'experimental');

    fs.mkdirSync(exp);
    const sub = path.join(exp, 'add');

    fs.mkdirSync(sub);
    await expect(findAncestorGenopCollectionRoot(sub, async (dirPath) => dirPath === root))
      .resolves.toBe(root);
  });

  it('returns undefined when no ancestor help exposes --genop', async () => {
    const root = mkTmp();
    const sub = path.join(root, 'add');

    fs.mkdirSync(sub);
    await expect(findAncestorGenopCollectionRoot(sub, async () => false))
      .resolves.toBeUndefined();
  });

  it('keeps hasAncestorBuildShWithGenop consistent (true when a root help exposes --genop)', async () => {
    const root = mkTmp();

    fs.writeFileSync(path.join(root, 'build.sh'), '--genop');
    const sub = path.join(root, 'add');

    fs.mkdirSync(sub);
    await expect(hasAncestorBuildShWithGenop(sub, async (dirPath) => dirPath === root))
      .resolves.toBe(true);
  });
});
