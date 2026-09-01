jest.mock('@plugin/helpers/output-channel', () => ({ appendLog: jest.fn() }));

import { appendLog } from '@plugin/helpers/output-channel';
import type { GlobalEnvSnapshot } from '@plugin/domain/utils/global-env-snapshot';

const ENV_KEYS = [
  'SOC_VERSION',
  'SIMULATOR_TYPE',
  'NPU_ARCH',
  'ASCEND_ENV_SCRIPT',
] as const;

type EnvValues = Partial<Record<(typeof ENV_KEYS)[number], string | undefined>>;

function loadSnapshotModule(env: EnvValues): GlobalEnvSnapshot {
  const saved: EnvValues = {};

  for (const key of ENV_KEYS) {
    saved[key] = process.env[key];

    if (env[key] === undefined) {
      delete process.env[key];
    }
    else {
      process.env[key] = env[key];
    }
  }

  let captured!: GlobalEnvSnapshot;

  jest.isolateModules(() => {
    const mod = jest.requireActual<{
      getGlobalEnvSnapshot(): GlobalEnvSnapshot;
    }>('@plugin/domain/utils/global-env-snapshot');

    captured = mod.getGlobalEnvSnapshot();
  });

  for (const key of ENV_KEYS) {
    if (saved[key] === undefined) {
      delete process.env[key];
    }
    else {
      process.env[key] = saved[key];
    }
  }

  return captured;
}

describe('global-env-snapshot', () => {
  it('captures all four env values at module load time', () => {
    const snapshot = loadSnapshotModule({
      SOC_VERSION: 'ascend950',
      SIMULATOR_TYPE: 'Ascend950PR_9589',
      NPU_ARCH: 'dav-1001',
      ASCEND_ENV_SCRIPT: '/opt/ascend/set_env.sh',
    });

    expect(snapshot)
      .toEqual({
        socVersion: 'ascend950',
        simulatorType: 'Ascend950PR_9589',
        npuArch: 'dav-1001',
        ascendEnvScript: '/opt/ascend/set_env.sh',
      });
  });

  it('treats unset env vars as undefined', () => {
    const snapshot = loadSnapshotModule({});

    expect(snapshot)
      .toEqual({
        socVersion: undefined,
        simulatorType: undefined,
        npuArch: undefined,
        ascendEnvScript: undefined,
      });
  });

  it('trims values and drops whitespace-only env vars', () => {
    const snapshot = loadSnapshotModule({
      SOC_VERSION: '  ascend910b  ',
      SIMULATOR_TYPE: '   ',
      NPU_ARCH: '',
    });

    expect(snapshot.socVersion)
      .toBe('ascend910b');
    expect(snapshot.simulatorType)
      .toBeUndefined();
    expect(snapshot.npuArch)
      .toBeUndefined();
  });

  it('treats a non-string env value as unset', () => {
    Object.defineProperty(process.env, 'SOC_VERSION', {
      value: 42,
      configurable: true,
    });

    try {
      const snapshot = loadSnapshotModule({});

      expect(snapshot.socVersion)
        .toBeUndefined();
    }
    finally {
      delete process.env.SOC_VERSION;
    }
  });

  it('returns a frozen snapshot object', () => {
    const snapshot = loadSnapshotModule({ SOC_VERSION: 'ascend910b' });

    expect(Object.isFrozen(snapshot))
      .toBe(true);
  });

  it('logs the frozen snapshot with <unset> for missing values', () => {
    const saved: EnvValues = {};

    for (const key of ENV_KEYS) {
      saved[key] = process.env[key];
      delete process.env[key];
    }

    process.env.SOC_VERSION = 'ascend950';
    process.env.ASCEND_ENV_SCRIPT = '/ws/set_env.sh';

    let log: (()=> void) | undefined;

    try {
      jest.isolateModules(() => {
        const mod = jest.requireActual<{
          logGlobalEnvSnapshot(): void;
        }>('@plugin/domain/utils/global-env-snapshot');

        log = mod.logGlobalEnvSnapshot;
      });
    }
    finally {
      for (const key of ENV_KEYS) {
        if (saved[key] === undefined) {
          delete process.env[key];
        }
        else {
          process.env[key] = saved[key];
        }
      }
    }

    log?.();

    expect(appendLog)
      .toHaveBeenCalledTimes(1);
    expect(appendLog)
      .toHaveBeenCalledWith(
        'op-devtools/ascend-env',
        expect.stringContaining('SOC_VERSION=ascend950'),
      );
    expect(appendLog)
      .toHaveBeenCalledWith(
        'op-devtools/ascend-env',
        expect.stringContaining('SIMULATOR_TYPE=<unset>'),
      );
    expect(appendLog)
      .toHaveBeenCalledWith(
        'op-devtools/ascend-env',
        expect.stringContaining('NPU_ARCH=<unset>'),
      );
    expect(appendLog)
      .toHaveBeenCalledWith(
        'op-devtools/ascend-env',
        expect.stringContaining('ASCEND_ENV_SCRIPT=/ws/set_env.sh'),
      );
  });
});
