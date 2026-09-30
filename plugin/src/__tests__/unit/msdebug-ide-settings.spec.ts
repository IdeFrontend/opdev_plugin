/**
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 * This program is free software, you can redistribute it and/or modify it under the terms and conditions of
 * CANN Open Software License Agreement Version 2.0 (the "License").
 * Please refer to the License for details. You may not use this file except in compliance with the License.
 * THIS SOFTWARE IS PROVIDED ON AN "AS IS" BASIS, WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED,
 * INCLUDING BUT NOT LIMITED TO NON-INFRINGEMENT, MERCHANTABILITY, OR FITNESS FOR A PARTICULAR PURPOSE.
 * See LICENSE in the root of the software repository for the full text of the License.
 */
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
