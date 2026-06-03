import { OperatorProjectType } from '@plugin/domain/models/operator-project-type';
import { AscendPlugin } from '@plugin/domain/plugins/ascend.plugin';
import { CannPlugin } from '@plugin/domain/plugins/cann.plugin';
import { OperatorPluginRegistry } from '@plugin/domain/plugins/operator-plugin.registry';
import { PyAscPlugin } from '@plugin/domain/plugins/pyasc.plugin';

const fullEnv = {
  SOC_VERSION: 'ascend950',
  NPU_ARCH: 'dav-3510',
};

describe('OperatorPluginRegistry spawn env', () => {
  beforeEach(() => {
    OperatorPluginRegistry._reset();
    OperatorPluginRegistry.registerOpPlugin(new CannPlugin());
    OperatorPluginRegistry.registerOpPlugin(new AscendPlugin());
    OperatorPluginRegistry.registerOpPlugin(new PyAscPlugin());
  });

  it('CannPlugin exports SOC_VERSION and NPU_ARCH', () => {
    expect(OperatorPluginRegistry.getOpPlugin('cann').getSpawnEnvExportKeys())
      .toEqual([
        'SOC_VERSION',
        'NPU_ARCH',
      ]);
  });

  it('AscendPlugin exports no spawn keys', () => {
    expect(OperatorPluginRegistry.getOpPlugin('ascend').getSpawnEnvExportKeys())
      .toEqual([]);
  });

  it('normalizeProjectTypeForSpawn maps legacy ascend to standard-custom', () => {
    expect(OperatorPluginRegistry.normalizeProjectTypeForSpawn('ascend'))
      .toBe(OperatorProjectType.STANDARD_CUSTOM);
    expect(OperatorPluginRegistry.normalizeProjectTypeForSpawn('ascend-c'))
      .toBe(OperatorProjectType.ASCEND_C);
  });

  it('normalizeOpTypeForSpawn maps known op_type strings', () => {
    expect(OperatorPluginRegistry.normalizeOpTypeForSpawn('cann'))
      .toBe('cann');
    expect(OperatorPluginRegistry.normalizeOpTypeForSpawn('unknown'))
      .toBeNull();
  });

  it('filterSpawnEnv keeps keys for cann op_type', () => {
    expect(OperatorPluginRegistry.filterSpawnEnv(fullEnv, 'cann', OperatorProjectType.ASCEND_C))
      .toEqual(fullEnv);
  });

  it('filterSpawnEnv returns empty for standard-custom project', () => {
    expect(OperatorPluginRegistry.filterSpawnEnv(fullEnv, 'ascend', OperatorProjectType.STANDARD_CUSTOM))
      .toEqual({});
  });

  it('filterSpawnEnv returns empty for pyasc project', () => {
    expect(OperatorPluginRegistry.filterSpawnEnv(fullEnv, 'pyasc', OperatorProjectType.PYASC))
      .toEqual({});
  });

  it('falls back to op_type when project_type is missing', () => {
    expect(OperatorPluginRegistry.filterSpawnEnv(fullEnv, 'cann', undefined))
      .toEqual(fullEnv);
    expect(OperatorPluginRegistry.filterSpawnEnv(fullEnv, 'ascend', undefined))
      .toEqual({});
  });
});
