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

import { ensureMsdebugBreakpointFileAssociations } from '@plugin/domain/utils/msdebug-ide-settings';
import {
  getIdeConfigDir, getIdeSettingsFilePath,
} from '@plugin/helpers/ide-config-dir';
import { resetGuardedPersistChainForTest } from '@plugin/helpers/ide-settings-persist';
import { ConfigService } from '@plugin/service/config-service';

describe('corrupt settings.json handling (refuse to overwrite)', () => {
  let tmpRoot: string;
  let settingsPath: string;

  beforeEach(() => {
    resetGuardedPersistChainForTest();
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'corrupt-settings-'));
    fs.mkdirSync(getIdeConfigDir(tmpRoot), { recursive: true });
    settingsPath = getIdeSettingsFilePath(tmpRoot);
  });

  afterEach(() => {
    fs.rmSync(tmpRoot, {
      recursive: true,
      force: true,
    });
  });

  it('writeOpDevtoolsDottedSettings refuses to overwrite a corrupt file without throwing', async () => {
    fs.writeFileSync(settingsPath, '{ not valid json', 'utf8');

    const wrote = await ConfigService.writeOpDevtoolsDottedSettings({ 'sanitizer.memory': true }, tmpRoot);

    expect(wrote)
      .toBe(false);
    expect(fs.readFileSync(settingsPath, 'utf8'))
      .toBe('{ not valid json');
  });

  it('ensureMsdebugBreakpointFileAssociations does not throw on a corrupt file and leaves it untouched', async () => {
    fs.writeFileSync(settingsPath, '{{{{', 'utf8');

    await expect(ensureMsdebugBreakpointFileAssociations(tmpRoot))
      .resolves.toBeUndefined();

    expect(fs.readFileSync(settingsPath, 'utf8'))
      .toBe('{{{{');
  });

  it('empty update on a corrupt file is a no-op without throwing', async () => {
    fs.writeFileSync(settingsPath, '{ broken', 'utf8');

    const wrote = await ConfigService.writeOpDevtoolsDottedSettings({}, tmpRoot);

    expect(wrote)
      .toBe(false);
    expect(fs.readFileSync(settingsPath, 'utf8'))
      .toBe('{ broken');
  });

  it('clearOpDevtoolsWorkspaceSettings does not throw on a corrupt file', async () => {
    fs.writeFileSync(settingsPath, 'not json at all', 'utf8');

    await expect(ConfigService.clearOpDevtoolsWorkspaceSettings(tmpRoot))
      .resolves.toBe(false);

    // An unparseable file is never touched, not even by a delete intent.
    expect(fs.readFileSync(settingsPath, 'utf8'))
      .toBe('not json at all');
  });
});
