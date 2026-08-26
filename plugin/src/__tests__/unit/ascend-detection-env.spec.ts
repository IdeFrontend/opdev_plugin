jest.mock('fs', () => ({ existsSync: jest.fn() }));
jest.mock('@plugin/helpers/operator-project-workspace-config', () => ({
  getConfiguredValue: jest.fn(() => undefined),
  getOpDevtoolsWorkspaceConfiguration: jest.fn(() => ({
    inspect: jest.fn(() => undefined),
    get: jest.fn(),
  })),

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
jest.mock('child_process', () => ({ execSync: jest.fn() }));

import fs from 'fs';
import path from 'path';
import child_process from 'child_process';

import { getGlobalEnvSnapshot } from '@plugin/domain/utils/global-env-snapshot';
import {
  execBashWithCannEnv,
  resolveCannSetEnvScriptForDetection,
  resolveCannSetEnvScriptWithoutScan,
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
    (getGlobalEnvSnapshot as jest.Mock).mockReturnValue({ ascendEnvScript: '/os/set_env.sh' });
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
    (getGlobalEnvSnapshot as jest.Mock).mockReturnValue({ ascendEnvScript: '/os/set_env.sh' });
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
    (getGlobalEnvSnapshot as jest.Mock).mockReturnValue({ ascendEnvScript: '/ok/os.sh' });
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

  it('returns undefined when every source misses and find finds nothing', () => {
    expect(resolveCannSetEnvScriptForDetection())
      .toBeUndefined();
    expect(execSync)
      .toHaveBeenCalledWith(
        'find / -path "*/cann*/set_env.sh" 2>/dev/null | head -1',
        expect.objectContaining({
          shell: '/bin/bash',
          timeout: 30000,
        }),
      );
  });

  it('returns undefined when the find fallback fails', () => {
    execSync.mockImplementation(() => {
      throw new Error('find failed');
    });

    expect(resolveCannSetEnvScriptForDetection())
      .toBeUndefined();
  });

  it('uses ASCEND_HOME_PATH as the first common-path candidate', () => {
    const homePath = '/opt/ascend-home';

    process.env.ASCEND_HOME_PATH = homePath;

    try {
      existsSync.mockImplementation((p: string) => p === path.join(homePath, 'set_env.sh'));

      expect(resolveCannSetEnvScriptForDetection())
        .toEqual({
          path: path.join(homePath, 'set_env.sh'),
          source: 'find',
        });
      expect(execSync)
        .not.toHaveBeenCalled();
    }
    finally {
      delete process.env.ASCEND_HOME_PATH;
    }
  });

  it('walks the fixed common paths when ASCEND_HOME_PATH is unset', () => {
    existsSync.mockImplementation((p: string) => p === '/usr/local/dcmi/set_env.sh');

    expect(resolveCannSetEnvScriptForDetection())
      .toEqual({
        path: '/usr/local/dcmi/set_env.sh',
        source: 'find',
      });
    expect(execSync)
      .not.toHaveBeenCalled();
  });

  it('treats a whitespace-only workspace path as unusable', () => {
    (getConfiguredEnvironmentScriptPath as jest.Mock).mockReturnValue('   ');
    (getGlobalEnvSnapshot as jest.Mock).mockReturnValue({ ascendEnvScript: '/ok/os.sh' });
    existsSync.mockImplementation((p: string) => p === '/ok/os.sh');

    expect(resolveCannSetEnvScriptForDetection())
      .toEqual({
        path: '/ok/os.sh',
        source: 'global-env',
      });
  });

  it('ignores a candidate when existsSync throws', () => {
    (getConfiguredEnvironmentScriptPath as jest.Mock).mockReturnValue('/throwing/ws.sh');
    (getGlobalEnvSnapshot as jest.Mock).mockReturnValue({ ascendEnvScript: '/ok/os.sh' });
    existsSync.mockImplementation((p: string) => {
      if (p === '/throwing/ws.sh') {
        throw new Error('EACCES');
      }

      return p === '/ok/os.sh';
    });

    expect(resolveCannSetEnvScriptForDetection())
      .toEqual({
        path: '/ok/os.sh',
        source: 'global-env',
      });
  });

  it('shellSourcePrefix leaves plain paths untouched', () => {
    expect(shellSourcePrefix('/opt/ascend/set_env.sh'))
      .toBe("source '/opt/ascend/set_env.sh' && ");
  });

  it('execBashWithCannEnv prefixes the command when a set-env script is resolved', () => {
    execSync.mockReturnValue('probe output');

    const out = execBashWithCannEnv(
      {
        path: '/ws/set_env.sh',
        source: 'workspace-setting',
      },
      'npu-smi info',
      20000,
    );

    expect(out)
      .toBe('probe output');
    expect(execSync)
      .toHaveBeenCalledWith(
        "source '/ws/set_env.sh' && npu-smi info",
        expect.objectContaining({
          shell: '/bin/bash',
          timeout: 20000,
        }),
      );
  });

  it('execBashWithCannEnv runs the bare command when no set-env script is resolved', () => {
    execSync.mockReturnValue('raw output');

    const out = execBashWithCannEnv(undefined, 'npu-smi info', 20000);

    expect(out)
      .toBe('raw output');
    expect(execSync)
      .toHaveBeenCalledWith(
        'npu-smi info',
        expect.objectContaining({
          shell: '/bin/bash',
          timeout: 20000,
        }),
      );
  });

  it('resolveCannSetEnvScriptWithoutScan never invokes find', () => {
    expect(resolveCannSetEnvScriptWithoutScan())
      .toBeUndefined();
    expect(execSync)
      .not.toHaveBeenCalled();
  });
});
