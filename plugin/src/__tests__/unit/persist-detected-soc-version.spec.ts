/**
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 * This program is free software, you can redistribute it and/or modify it under the terms and conditions of
 * CANN Open Software License Agreement Version 2.0 (the "License").
 * Please refer to the License for details. You may not use this file except in compliance with the License.
 * THIS SOFTWARE IS PROVIDED ON AN "AS IS" BASIS, WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED,
 * INCLUDING BUT NOT LIMITED TO NON-INFRINGEMENT, MERCHANTABILITY, OR FITNESS FOR A PARTICULAR PURPOSE.
 * See LICENSE in the root of the software repository for the full text of the License.
 */
jest.mock('@plugin/helpers/operator-project-workspace-config', () => ({
  ...(jest.requireActual('@plugin/helpers/operator-project-workspace-config') as Record<string, unknown>),
  getSocVersionWithWorkspaceOverride: jest.fn(() => ''),
}));

import type { AscendEnvResolution } from '@plugin/domain/utils/ascend-util';
import { persistDetectedSocVersion } from '@plugin/domain/utils/ascend-util';
import { getSocVersionWithWorkspaceOverride } from '@plugin/helpers/operator-project-workspace-config';
import { ConfigService } from '@plugin/service/config-service';

const resolution = (overrides: Partial<AscendEnvResolution> = {}): AscendEnvResolution => ({
  socVersion: 'ascend950',
  npuArch: 'dav-3510',
  simulatorType: undefined,
  source: {
    socVersion: 'detected',
    simulatorType: 'n/a',
    npuArch: 'derived-from-soc',
  },
  ...overrides,
});

describe('persistDetectedSocVersion', () => {
  let writeSpy: jest.SpyInstance;

  beforeEach(() => {
    writeSpy = jest.spyOn(ConfigService, 'writeOpDevtoolsDottedSettings')
      .mockResolvedValue(true);
    (getSocVersionWithWorkspaceOverride as jest.Mock).mockReturnValue('');
  });

  afterEach(() => {
    writeSpy.mockRestore();
  });

  it('pins a host-detected SOC so a reopened project resolves NPU_ARCH without probing', async () => {
    await expect(persistDetectedSocVersion(resolution()))
      .resolves
      .toBe(true);
    expect(writeSpy)
      .toHaveBeenCalledWith({ 'environment.socVersion': 'ascend950' });
  });

  it('never clobbers an explicit workspace socVersion', async () => {
    (getSocVersionWithWorkspaceOverride as jest.Mock).mockReturnValue('ascend910b');

    await expect(persistDetectedSocVersion(resolution()))
      .resolves
      .toBe(false);
    expect(writeSpy)
      .not
      .toHaveBeenCalled();
  });

  it('writes nothing for a SOC that was not host-detected', async () => {
    for (const source of [
      'workspace-setting',
      'global-env',
      'derived-from-simulator',
      'default',
    ] as const) {
      await expect(persistDetectedSocVersion(resolution({
        source: {
          socVersion: source,
          simulatorType: 'n/a',
          npuArch: 'derived-from-soc',
        },
      })))
        .resolves
        .toBe(false);
    }

    expect(writeSpy)
      .not
      .toHaveBeenCalled();
  });

  it('pins the chip-specific NPU_ARCH too, since the pinned SOC stops the next detection', async () => {
    // Ascend910ProA and friends resolve dav-1001 only while the detected chip name is cached
    // in this process; the slug alone would answer with the ascend910b series default.
    await expect(persistDetectedSocVersion(resolution({
      socVersion: 'ascend910b',
      npuArch: 'dav-1001',
    })))
      .resolves
      .toBe(true);
    expect(writeSpy)
      .toHaveBeenCalledWith({
        'environment.socVersion': 'ascend910b',
        'environment.npuArch': 'dav-1001',
      });
  });

  it('leaves NPU_ARCH out when the slug alone already yields it', async () => {
    await expect(persistDetectedSocVersion(resolution({
      socVersion: 'ascend910b',
      npuArch: 'dav-2201',
    })))
      .resolves
      .toBe(true);
    expect(writeSpy)
      .toHaveBeenCalledWith({ 'environment.socVersion': 'ascend910b' });
  });

  it('never freezes an NPU_ARCH that came from the OS environment', async () => {
    await expect(persistDetectedSocVersion(resolution({
      socVersion: 'ascend910b',
      npuArch: 'dav-1001',
      source: {
        socVersion: 'detected',
        simulatorType: 'n/a',
        npuArch: 'global-env',
      },
    })))
      .resolves
      .toBe(true);
    expect(writeSpy)
      .toHaveBeenCalledWith({ 'environment.socVersion': 'ascend910b' });
  });

  it('writes nothing for a blank SOC', async () => {
    await expect(persistDetectedSocVersion(resolution({ socVersion: '  ' })))
      .resolves
      .toBe(false);
    expect(writeSpy)
      .not
      .toHaveBeenCalled();
  });
});
