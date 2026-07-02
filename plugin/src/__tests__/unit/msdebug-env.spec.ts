import fs from 'fs-extra';
import os from 'os';
import path from 'path';

import {
  ensureMsdebugLibInEnvFile,
  resolveMsdebugLibDir,
  upsertLdLibraryPath,
} from '@plugin/domain/utils/msdebug-env';
import { getIdeConfigDirName } from '@plugin/helpers/ide-config-dir';

const LIB = '/home/dev/Ascend/cann-9.0.0/tools/msdebug/lib';

describe('upsertLdLibraryPath', () => {
  it('appends the lib dir to an existing LD_LIBRARY_PATH entry', () => {
    expect(upsertLdLibraryPath(
      'PATH=/usr/bin\nLD_LIBRARY_PATH=/usr/lib64\nHOME=/root\n',
      LIB,
    ))
      .toBe(`PATH=/usr/bin\nLD_LIBRARY_PATH=/usr/lib64:${LIB}\nHOME=/root\n`);
  });

  it('adds an LD_LIBRARY_PATH line when the dump has none', () => {
    expect(upsertLdLibraryPath('PATH=/usr/bin\nHOME=/root\n', LIB))
      .toBe(`PATH=/usr/bin\nHOME=/root\nLD_LIBRARY_PATH=${LIB}\n`);
  });

  it('terminates the file with a newline even when the input lacks one', () => {
    expect(upsertLdLibraryPath('PATH=/usr/bin', LIB))
      .toBe(`PATH=/usr/bin\nLD_LIBRARY_PATH=${LIB}\n`);
  });

  it('returns the content unchanged when the lib dir is already a component', () => {
    const content = `LD_LIBRARY_PATH=/usr/lib64:${LIB}:/opt/lib\n`;

    expect(upsertLdLibraryPath(content, LIB))
      .toBe(content);
  });

  it('does not treat a longer sibling path as an existing component', () => {
    expect(upsertLdLibraryPath(`LD_LIBRARY_PATH=${LIB}64\n`, LIB))
      .toBe(`LD_LIBRARY_PATH=${LIB}64:${LIB}\n`);
  });

  it('sets the value when the existing LD_LIBRARY_PATH is empty', () => {
    expect(upsertLdLibraryPath('LD_LIBRARY_PATH=\n', LIB))
      .toBe(`LD_LIBRARY_PATH=${LIB}\n`);
  });
});

describe('resolveMsdebugLibDir', () => {
  const existsAmong = (...dirs: string[]) => (p: string) => dirs.includes(p);

  it('resolves from ASCEND_TOOLKIT_HOME', () => {
    expect(resolveMsdebugLibDir(
      { ASCEND_TOOLKIT_HOME: '/home/dev/Ascend/cann-9.0.0' },
      undefined,
      existsAmong(LIB),
    ))
      .toBe(LIB);
  });

  it('joins cleanly when the toolkit home has a trailing slash', () => {
    expect(resolveMsdebugLibDir(
      { ASCEND_TOOLKIT_HOME: '/home/dev/Ascend/cann-9.0.0/' },
      undefined,
      existsAmong(LIB),
    ))
      .toBe(LIB);
  });

  it('prefers ASCEND_TOOLKIT_HOME over ASCEND_HOME_PATH', () => {
    expect(resolveMsdebugLibDir(
      {
        ASCEND_TOOLKIT_HOME: '/toolkit',
        ASCEND_HOME_PATH: '/homepath',
      },
      undefined,
      existsAmong('/toolkit/tools/msdebug/lib', '/homepath/tools/msdebug/lib'),
    ))
      .toBe('/toolkit/tools/msdebug/lib');
  });

  it('falls back to ASCEND_HOME_PATH when the toolkit-home dir is missing', () => {
    expect(resolveMsdebugLibDir(
      {
        ASCEND_TOOLKIT_HOME: '/toolkit',
        ASCEND_HOME_PATH: '/homepath',
      },
      undefined,
      existsAmong('/homepath/tools/msdebug/lib'),
    ))
      .toBe('/homepath/tools/msdebug/lib');
  });

  it('falls back to the set_env.sh sibling tools/msdebug/lib dir', () => {
    expect(resolveMsdebugLibDir(
      {},
      '/home/dev/Ascend/cann-9.0.0/set_env.sh',
      existsAmong(LIB),
    ))
      .toBe(LIB);
  });

  it('supports the ascend-toolkit/latest layout next to set_env.sh', () => {
    expect(resolveMsdebugLibDir(
      {},
      '/usr/local/Ascend/ascend-toolkit/set_env.sh',
      existsAmong('/usr/local/Ascend/ascend-toolkit/latest/tools/msdebug/lib'),
    ))
      .toBe('/usr/local/Ascend/ascend-toolkit/latest/tools/msdebug/lib');
  });

  it('returns undefined when no candidate dir exists', () => {
    expect(resolveMsdebugLibDir(
      { ASCEND_TOOLKIT_HOME: '/toolkit' },
      '/etc/profile',
      () => false,
    ))
      .toBeUndefined();
  });
});

describe('ensureMsdebugLibInEnvFile', () => {
  let workspaceRoot: string;
  let toolkitHome: string;
  let msdebugLib: string;
  let envFilePath: string;

  beforeEach(async () => {
    workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'msdebug-env-'));
    toolkitHome = path.join(workspaceRoot, 'cann');
    msdebugLib = path.join(toolkitHome, 'tools', 'msdebug', 'lib');
    envFilePath = path.join(workspaceRoot, getIdeConfigDirName(), '.env');
    await fs.ensureDir(msdebugLib);
    await fs.ensureDir(path.dirname(envFilePath));
  });

  afterEach(async () => {
    await fs.remove(workspaceRoot);
  });

  it('appends the msdebug lib dir to LD_LIBRARY_PATH in the .env file', async () => {
    await fs.writeFile(
      envFilePath,
      `ASCEND_TOOLKIT_HOME=${toolkitHome}\nLD_LIBRARY_PATH=/usr/lib64\n`,
      'utf-8',
    );

    await expect(ensureMsdebugLibInEnvFile(workspaceRoot))
      .resolves.toBe(true);

    const expected = `ASCEND_TOOLKIT_HOME=${toolkitHome}\nLD_LIBRARY_PATH=/usr/lib64:${msdebugLib}\n`;

    await expect(fs.readFile(envFilePath, 'utf-8'))
      .resolves.toBe(expected);
  });

  it('is idempotent — a second run reports no change', async () => {
    await fs.writeFile(
      envFilePath,
      `ASCEND_TOOLKIT_HOME=${toolkitHome}\nLD_LIBRARY_PATH=/usr/lib64\n`,
      'utf-8',
    );

    await ensureMsdebugLibInEnvFile(workspaceRoot);
    const afterFirst = await fs.readFile(envFilePath, 'utf-8');

    await expect(ensureMsdebugLibInEnvFile(workspaceRoot))
      .resolves.toBe(false);
    await expect(fs.readFile(envFilePath, 'utf-8'))
      .resolves.toBe(afterFirst);
  });

  it('resolves the toolkit through the set_env.sh path when the dump lacks ASCEND vars', async () => {
    await fs.writeFile(envFilePath, 'LD_LIBRARY_PATH=/usr/lib64\n', 'utf-8');

    const setEnvScript = path.join(toolkitHome, 'set_env.sh');

    await expect(ensureMsdebugLibInEnvFile(workspaceRoot, setEnvScript))
      .resolves.toBe(true);

    await expect(fs.readFile(envFilePath, 'utf-8'))
      .resolves.toBe(`LD_LIBRARY_PATH=/usr/lib64:${msdebugLib}\n`);
  });

  it('returns false when the .env file does not exist', async () => {
    await expect(ensureMsdebugLibInEnvFile(workspaceRoot))
      .resolves.toBe(false);
  });

  it('leaves the file untouched when no toolkit dir can be resolved', async () => {
    const content = 'LD_LIBRARY_PATH=/usr/lib64\n';

    await fs.writeFile(envFilePath, content, 'utf-8');

    await expect(ensureMsdebugLibInEnvFile(workspaceRoot))
      .resolves.toBe(false);
    await expect(fs.readFile(envFilePath, 'utf-8'))
      .resolves.toBe(content);
  });
});
