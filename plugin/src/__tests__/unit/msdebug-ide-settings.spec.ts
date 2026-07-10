import fs from 'fs-extra';
import os from 'os';
import path from 'path';

import {
  ensureMsdebugBreakpointFileAssociations,
  MSDEBUG_KERNEL_FILE_ASSOCIATIONS,
} from '@plugin/domain/utils/msdebug-ide-settings';
import { ensureLaunchJsonExists } from '@plugin/domain/utils/project-utils';

describe('ensureMsdebugBreakpointFileAssociations', () => {
  let workspaceRoot: string;
  let settingsPath: string;

  beforeEach(async () => {
    workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'msdebug-settings-'));
    settingsPath = path.join(workspaceRoot, '.vscode', 'settings.json');
  });

  afterEach(async () => {
    await fs.remove(workspaceRoot);
  });

  it('creates settings.json with *.cce and *.asc → cpp associations', async () => {
    await ensureMsdebugBreakpointFileAssociations(workspaceRoot);

    const settings = JSON.parse(await fs.readFile(settingsPath, 'utf-8')) as {
      'files.associations': Record<string, string>;
    };

    expect(settings['files.associations']['*.cce'])
      .toBe(MSDEBUG_KERNEL_FILE_ASSOCIATIONS['*.cce']);
    expect(settings['files.associations']['*.asc'])
      .toBe(MSDEBUG_KERNEL_FILE_ASSOCIATIONS['*.asc']);
  });

  it('merges without removing existing associations', async () => {
    await fs.ensureDir(path.dirname(settingsPath));
    await fs.writeFile(settingsPath, JSON.stringify({ 'files.associations': { '*.custom': 'plaintext' } }, null, 2));

    await ensureMsdebugBreakpointFileAssociations(workspaceRoot);

    const settings = JSON.parse(await fs.readFile(settingsPath, 'utf-8')) as {
      'files.associations': Record<string, string>;
    };

    expect(settings['files.associations']['*.custom'])
      .toBe('plaintext');
    expect(settings['files.associations']['*.cce'])
      .toBe('cpp');
    expect(settings['files.associations']['*.asc'])
      .toBe('cpp');
  });

  it('preserves existing workspace associations for seeded kernel globs', async () => {
    await fs.ensureDir(path.dirname(settingsPath));
    await fs.writeFile(settingsPath, JSON.stringify({
      'files.associations': {
        '*.asc': 'plaintext',
        '*.cce': 'cuda-cpp',
      },
    }, null, 2));

    await ensureMsdebugBreakpointFileAssociations(workspaceRoot);

    const settings = JSON.parse(await fs.readFile(settingsPath, 'utf-8')) as {
      'files.associations': Record<string, string>;
    };

    expect(settings['files.associations']['*.asc'])
      .toBe('plaintext');
    expect(settings['files.associations']['*.cce'])
      .toBe('cuda-cpp');
  });

  it('ensures kernel associations when devtool_config.json already exists', async () => {
    await fs.ensureDir(path.dirname(settingsPath));
    await fs.writeFile(path.join(path.dirname(settingsPath), 'devtool_config.json'), JSON.stringify({ type: '1' }, null, 2));

    await ensureLaunchJsonExists(workspaceRoot, '1');

    const settings = JSON.parse(await fs.readFile(settingsPath, 'utf-8')) as {
      'files.associations': Record<string, string>;
    };

    expect(settings['files.associations']['*.cce'])
      .toBe('cpp');
    expect(settings['files.associations']['*.asc'])
      .toBe('cpp');
  });
});
