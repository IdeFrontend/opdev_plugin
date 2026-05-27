jest.mock('fs', () => ({
  existsSync: jest.fn(),
}));
jest.mock('@plugin/helpers/operator-project-workspace-config', () => ({
  getConfiguredEnvironmentScriptPath: jest.fn(),
}));
jest.mock('@plugin/domain/utils/global-env-snapshot', () => ({
  getGlobalEnvSnapshot: jest.fn(() => ({
    socVersion: undefined,
    simulatorType: undefined,
    npuArch: undefined,
    ascendEnvScript: undefined,
  })),
}));
jest.mock('child_process', () => ({
  execSync: jest.fn(),
}));

import fs from 'fs';
import child_process from 'child_process';

import { getGlobalEnvSnapshot } from '@plugin/domain/utils/global-env-snapshot';
import {
  resolveCannSetEnvScriptForDetection,
  shellSourcePrefix,
} from '@plugin/domain/utils/ascend-detection-env';
import { getConfiguredEnvironmentScriptPath } from '@plugin/helpers/operator-project-workspace-config';

const existsSync = fs.existsSync as jest.Mock;
const execSync = child_process.execSync as jest.Mock;

describe('resolveCannSetEnvScriptForDetection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getConfiguredEnvironmentScriptPath as jest.Mock).mockReturnValue(undefined);
    (getGlobalEnvSnapshot as jest.Mock).mockReturnValue({
      socVersion: undefined,
      simulatorType: undefined,
      npuArch: undefined,
      ascendEnvScript: undefined,
    });
    existsSync.mockReturnValue(false);
    execSync.mockReturnValue('');
  });

  it('prefers explicit workspace script over ASCEND_ENV_SCRIPT snapshot', () => {
    (getConfiguredEnvironmentScriptPath as jest.Mock).mockReturnValue('/ws/set_env.sh');
    (getGlobalEnvSnapshot as jest.Mock).mockReturnValue({
      ascendEnvScript: '/os/set_env.sh',
    });
    existsSync.mockImplementation((p: string) => p === '/ws/set_env.sh');

    expect(resolveCannSetEnvScriptForDetection())
      .toEqual({
        path: '/ws/set_env.sh',
        source: 'workspace-setting',
      });
    expect(execSync)
      .not.toHaveBeenCalled();
  });

  it('uses ASCEND_ENV_SCRIPT snapshot when workspace path is unset', () => {
    (getGlobalEnvSnapshot as jest.Mock).mockReturnValue({
      ascendEnvScript: '/os/set_env.sh',
    });
    existsSync.mockImplementation((p: string) => p === '/os/set_env.sh');

    expect(resolveCannSetEnvScriptForDetection())
      .toEqual({
        path: '/os/set_env.sh',
        source: 'global-env',
      });
  });

  it('falls back to find when no configured path exists on disk', () => {
    execSync.mockReturnValue('/found/cann/set_env.sh\n');
    existsSync.mockImplementation((p: string) => p === '/found/cann/set_env.sh');

    expect(resolveCannSetEnvScriptForDetection())
      .toEqual({
        path: '/found/cann/set_env.sh',
        source: 'find',
      });
  });

  it('skips missing paths and tries the next candidate', () => {
    (getConfiguredEnvironmentScriptPath as jest.Mock).mockReturnValue('/missing/ws.sh');
    (getGlobalEnvSnapshot as jest.Mock).mockReturnValue({
      ascendEnvScript: '/ok/os.sh',
    });
    existsSync.mockImplementation((p: string) => p === '/ok/os.sh');

    expect(resolveCannSetEnvScriptForDetection())
      .toEqual({
        path: '/ok/os.sh',
        source: 'global-env',
      });
  });

  it('shellSourcePrefix escapes single quotes in paths', () => {
    expect(shellSourcePrefix("/path/with'quote/set_env.sh"))
      .toBe("source '/path/with'\"'\"'quote/set_env.sh' && ");
  });
});
