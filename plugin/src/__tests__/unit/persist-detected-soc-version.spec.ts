jest.mock('@plugin/helpers/operator-project-workspace-config', () => ({
  ...(jest.requireActual('@plugin/helpers/operator-project-workspace-config') as Record<string, unknown>),
  getSocVersionWithWorkspaceOverride: jest.fn(() => ''),
}));

import type { AscendEnvResolution } from '@plugin/domain/utils/ascend-util';
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

describe('ConfigService.persistDetectedSocVersion (issue #37)', () => {
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
    await expect(ConfigService.persistDetectedSocVersion(resolution()))
      .resolves
      .toBe(true);
    expect(writeSpy)
      .toHaveBeenCalledWith({ 'environment.socVersion': 'ascend950' });
  });

  it('never clobbers an explicit workspace socVersion', async () => {
    (getSocVersionWithWorkspaceOverride as jest.Mock).mockReturnValue('ascend910b');

    await expect(ConfigService.persistDetectedSocVersion(resolution()))
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
      await expect(ConfigService.persistDetectedSocVersion(resolution({
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

  it('writes nothing for a blank SOC', async () => {
    await expect(ConfigService.persistDetectedSocVersion(resolution({ socVersion: '  ' })))
      .resolves
      .toBe(false);
    expect(writeSpy)
      .not
      .toHaveBeenCalled();
  });
});
