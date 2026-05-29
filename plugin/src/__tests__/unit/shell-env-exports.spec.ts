import {
  formatAscendEnvExports,
  injectAscendEnvExports,
  shellQuoteBash,
} from '@plugin/domain/utils/shell-env-exports';

describe('shell-env-exports', () => {
  it('shellQuoteBash wraps values and escapes single quotes', () => {
    expect(shellQuoteBash('ascend950'))
      .toBe("'ascend950'");
    expect(shellQuoteBash("foo'bar"))
      .toBe("'foo'\\''bar'");
  });

  it('formatAscendEnvExports emits exports in fixed key order', () => {
    const result = formatAscendEnvExports({
      SUPPORT_TILING_DIR: 'arch35',
      SOC_VERSION: 'ascend950',
      NPU_ARCH: 'dav-3510',
      SUPPORT_COMPUTE_UNIT: 'ascend950',
    });

    expect(result)
      .toBe(
        "export SOC_VERSION='ascend950' && export NPU_ARCH='dav-3510' && "
        + "export SUPPORT_COMPUTE_UNIT='ascend950' && export SUPPORT_TILING_DIR='arch35'",
      );
  });

  it('formatAscendEnvExports skips empty values', () => {
    expect(formatAscendEnvExports({
      SOC_VERSION: '',
      NPU_ARCH: '   ',
      SUPPORT_COMPUTE_UNIT: 'ascend910_95',
      SUPPORT_TILING_DIR: '',
    }))
      .toBe("export SUPPORT_COMPUTE_UNIT='ascend910_95'");
  });

  it('injectAscendEnvExports returns command unchanged when all values empty', () => {
    const command = 'cd /proj/build && ./build.sh';

    expect(injectAscendEnvExports(command, {
      SOC_VERSION: '',
      NPU_ARCH: '',
      SUPPORT_COMPUTE_UNIT: '',
      SUPPORT_TILING_DIR: '',
    }))
      .toBe(command);
  });

  it('injectAscendEnvExports prepends exports when no source prefix', () => {
    expect(injectAscendEnvExports('cd build && ./build.sh', {
      SOC_VERSION: 'ascend950',
      NPU_ARCH: 'dav-3510',
      SUPPORT_COMPUTE_UNIT: 'ascend950',
      SUPPORT_TILING_DIR: 'arch35',
    }))
      .toBe(
        "export SOC_VERSION='ascend950' && export NPU_ARCH='dav-3510' && "
        + "export SUPPORT_COMPUTE_UNIT='ascend950' && export SUPPORT_TILING_DIR='arch35' && "
        + 'cd build && ./build.sh',
      );
  });

  it('injectAscendEnvExports inserts exports before ascend_env_script source prefix', () => {
    expect(injectAscendEnvExports('. /cann/set_env.sh && cd build && ./build.sh', {
      SOC_VERSION: 'ascend950',
      NPU_ARCH: 'dav-3510',
      SUPPORT_COMPUTE_UNIT: 'ascend950',
      SUPPORT_TILING_DIR: 'arch35',
    }))
      .toBe(
        "export SOC_VERSION='ascend950' && export NPU_ARCH='dav-3510' && "
        + "export SUPPORT_COMPUTE_UNIT='ascend950' && export SUPPORT_TILING_DIR='arch35' && "
        + '. /cann/set_env.sh && cd build && ./build.sh',
      );
  });
});
