import fs from 'fs-extra';
import os from 'os';
import path from 'path';

import {
  ensureMsdebugBreakpointFileAssociations,
  MSDEBUG_KERNEL_FILE_ASSOCIATIONS,
} from '@plugin/domain/utils/msdebug-ide-settings';

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

  it('creates settings.json with *.cce → cpp association', async () => {
    await ensureMsdebugBreakpointFileAssociations(workspaceRoot);

    const settings = JSON.parse(await fs.readFile(settingsPath, 'utf-8')) as {
      'files.associations': Record<string, string>;
    };

    expect(settings['files.associations']['*.cce'])
      .toBe(MSDEBUG_KERNEL_FILE_ASSOCIATIONS['*.cce']);
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
  });
});
