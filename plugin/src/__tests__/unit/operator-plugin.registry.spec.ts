import { OperatorProjectType } from '@plugin/domain/models/operator-project-type';
import { AscendPlugin } from '@plugin/domain/plugins/ascend.plugin';
import { CannPlugin } from '@plugin/domain/plugins/cann.plugin';
import { PyAscPlugin } from '@plugin/domain/plugins/pyasc.plugin';
import { TritonPlugin } from '@plugin/domain/plugins/triton.plugin';
import { OperatorPluginRegistry } from '@plugin/domain/plugins/operator-plugin.registry';
import type { IProjectDetector } from '@plugin/domain/plugins/project-detector.interface';
import type { IOperatorPlugin } from '@plugin/domain/plugins/operator-plugin.interface';

function registerDefaultPlugins(): void {
  OperatorPluginRegistry.registerOpPlugin(new CannPlugin());
  OperatorPluginRegistry.registerOpPlugin(new AscendPlugin());
  OperatorPluginRegistry.registerOpPlugin(new PyAscPlugin());
  OperatorPluginRegistry.registerOpPlugin(new TritonPlugin());
}

function makeDetector(
  projectType: OperatorProjectType,
  isMatch: boolean,
  confidence: 'definitive' | 'heuristic',
): IProjectDetector {
  return {
    projectType,
    detectProject: jest.fn(async () => ({
      isMatch,
      confidence,
    })),
  };
}

describe('OperatorPluginRegistry', () => {
  beforeEach(() => {
    OperatorPluginRegistry._reset();
  });

  describe('getOpPlugin', () => {
    it('returns the cann plugin for a known op type', () => {
      registerDefaultPlugins();

      expect(OperatorPluginRegistry.getOpPlugin('cann').opType)
        .toBe('cann');
    });

    it('falls back to cann for a missing op type', () => {
      registerDefaultPlugins();

      expect(OperatorPluginRegistry.getOpPlugin('nope').opType)
        .toBe('cann');
    });

    it('falls back to cann for a null or empty op type', () => {
      registerDefaultPlugins();

      expect(OperatorPluginRegistry.getOpPlugin(null).opType)
        .toBe('cann');
      expect(OperatorPluginRegistry.getOpPlugin(undefined).opType)
        .toBe('cann');
      expect(OperatorPluginRegistry.getOpPlugin('').opType)
        .toBe('cann');
    });
  });

  describe('register / registerDetector', () => {
    it('registers a plugin for both op types and detection', async () => {
      const dual = {
        opType: 'dual',
        projectType: OperatorProjectType.PYASC,
        detectProject: jest.fn(async () => ({
          isMatch: true,
          confidence: 'definitive',
        })),
      } as unknown as IOperatorPlugin & IProjectDetector;

      OperatorPluginRegistry.register(dual);
      OperatorPluginRegistry.registerDetector(makeDetector(OperatorProjectType.ASCEND_C, false, 'heuristic'));

      expect(OperatorPluginRegistry.getOpPlugin('dual'))
        .toBe(dual);
      const match = await OperatorPluginRegistry.detectProject('/any');

      expect(match?.detector)
        .toBe(dual);
    });
  });

  describe('detectProject', () => {
    it('returns null when no detector matches', async () => {
      OperatorPluginRegistry.registerDetector(makeDetector(OperatorProjectType.ASCEND_C, false, 'heuristic'));

      await expect(OperatorPluginRegistry.detectProject('/repo')).resolves.toBeNull();
    });

    it('keeps the first heuristic match when no definitive match exists', async () => {
      const first = makeDetector(OperatorProjectType.TORCH_LIBRARY, true, 'heuristic');
      const second = makeDetector(OperatorProjectType.PYASC, true, 'heuristic');

      OperatorPluginRegistry.registerDetector(first);
      OperatorPluginRegistry.registerDetector(second);

      const match = await OperatorPluginRegistry.detectProject('/repo');

      expect(match)
        .toEqual({
          detector: first,
          projectType: OperatorProjectType.TORCH_LIBRARY,
        });
    });

    it('stops at the first definitive match and never consults later detectors', async () => {
      const definitive = makeDetector(OperatorProjectType.STANDARD_CUSTOM, true, 'definitive');
      const later = makeDetector(OperatorProjectType.TRITON, true, 'definitive');

      OperatorPluginRegistry.registerDetector(makeDetector(OperatorProjectType.PYASC, false, 'heuristic'));
      OperatorPluginRegistry.registerDetector(definitive);
      OperatorPluginRegistry.registerDetector(later);

      const match = await OperatorPluginRegistry.detectProject('/repo');

      expect(match)
        .toEqual({
          detector: definitive,
          projectType: OperatorProjectType.STANDARD_CUSTOM,
        });
      expect(later.detectProject).not.toHaveBeenCalled();
    });

    it('prefers a definitive match over an earlier heuristic one', async () => {
      const heuristic = makeDetector(OperatorProjectType.PYASC, true, 'heuristic');
      const definitive = makeDetector(OperatorProjectType.ASCEND_C, true, 'definitive');

      OperatorPluginRegistry.registerDetector(heuristic);
      OperatorPluginRegistry.registerDetector(definitive);

      const match = await OperatorPluginRegistry.detectProject('/repo');

      expect(match)
        .toEqual({
          detector: definitive,
          projectType: OperatorProjectType.ASCEND_C,
        });
    });
  });

  describe('getProjectTypePlugin', () => {
    it('maps a project type to its plugin through projectTypeMappings', () => {
      registerDefaultPlugins();

      expect(OperatorPluginRegistry.getProjectTypePlugin('standard-custom'))
        .toBe(OperatorPluginRegistry.getOpPlugin('cann'));
      expect(OperatorPluginRegistry.getProjectTypePlugin('ascend-c'))
        .toBe(OperatorPluginRegistry.getOpPlugin('ascend'));
      expect(OperatorPluginRegistry.getProjectTypePlugin('torch-library'))
        .toBe(OperatorPluginRegistry.getOpPlugin('ascend'));
    });

    it('falls back to the cann plugin for unknown or missing project types', () => {
      registerDefaultPlugins();

      expect(OperatorPluginRegistry.getProjectTypePlugin('mystery'))
        .toBe(OperatorPluginRegistry.getOpPlugin('cann'));
      expect(OperatorPluginRegistry.getProjectTypePlugin(null))
        .toBe(OperatorPluginRegistry.getOpPlugin('cann'));
    });
  });

  describe('getBuildBehaviorByProjectType', () => {
    it('uses the mapped plugin build behavior for a known project type', () => {
      registerDefaultPlugins();

      expect(OperatorPluginRegistry.getBuildBehaviorByProjectType('standard-custom'))
        .toBe(OperatorPluginRegistry.getOpPlugin('cann').buildBehavior);
      expect(OperatorPluginRegistry.getBuildBehaviorByProjectType('triton'))
        .toBe(OperatorPluginRegistry.getOpPlugin('triton').buildBehavior);
    });

    it('falls back to the op type plugin build behavior', () => {
      registerDefaultPlugins();

      expect(OperatorPluginRegistry.getBuildBehaviorByProjectType('mystery'))
        .toBe(OperatorPluginRegistry.getOpPlugin('mystery').buildBehavior);
      expect(OperatorPluginRegistry.getBuildBehaviorByProjectType(undefined))
        .toBe(OperatorPluginRegistry.getOpPlugin(undefined).buildBehavior);
    });
  });

  describe('getProjectGenerator / getDefaultPaths', () => {
    it('delegates generator creation to the op plugin', () => {
      const plugin = new CannPlugin();
      const generator = {};
      const createProjectGenerator = jest.spyOn(plugin, 'createProjectGenerator')
        .mockReturnValue(generator as never);

      OperatorPluginRegistry.registerOpPlugin(plugin);

      const result = OperatorPluginRegistry.getProjectGenerator(
        { op_type: 'cann' } as never,
        {} as never,
        '/ext',
      );

      expect(createProjectGenerator)
        .toHaveBeenCalledWith({ op_type: 'cann' }, {}, '/ext');
      expect(result)
        .toBe(generator);
    });

    it('delegates default path lookup to the op plugin', () => {
      const plugin = new CannPlugin();
      const getDefaultPaths = jest.spyOn(plugin, 'getDefaultPaths')
        .mockReturnValue({} as never);
      const op = {
        op_path: '/repo',
        op_type: 'cann',
        op_name: 'add',
      };

      OperatorPluginRegistry.registerOpPlugin(plugin);
      OperatorPluginRegistry.getDefaultPaths(op);

      expect(getDefaultPaths)
        .toHaveBeenCalledWith(op);
    });
  });

  describe('getSpawnEnvExportKeys', () => {
    it('returns no keys for project types that never export spawn env', () => {
      registerDefaultPlugins();

      for (const projectType of [
        OperatorProjectType.STANDARD_CUSTOM,
        OperatorProjectType.PYASC,
        OperatorProjectType.TRITON,
      ]) {
        expect(OperatorPluginRegistry.getSpawnEnvExportKeys('cann', projectType))
          .toEqual([]);
      }
    });

    it('uses the cann cmake keys for ascend-c and torch-library', () => {
      registerDefaultPlugins();

      expect(OperatorPluginRegistry.getSpawnEnvExportKeys(undefined, OperatorProjectType.ASCEND_C))
        .toEqual([
          'SOC_VERSION',
          'NPU_ARCH',
        ]);
      expect(OperatorPluginRegistry.getSpawnEnvExportKeys(undefined, OperatorProjectType.TORCH_LIBRARY))
        .toEqual([
          'SOC_VERSION',
          'NPU_ARCH',
        ]);
    });

    it('defers to the op type plugin when no project type forces it', () => {
      registerDefaultPlugins();

      expect(OperatorPluginRegistry.getSpawnEnvExportKeys('cann', undefined))
        .toEqual([
          'SOC_VERSION',
          'NPU_ARCH',
        ]);
      expect(OperatorPluginRegistry.getSpawnEnvExportKeys('ascend', undefined))
        .toEqual([]);
    });

    it('returns no keys when neither project type nor op type resolves', () => {
      registerDefaultPlugins();

      expect(OperatorPluginRegistry.getSpawnEnvExportKeys(undefined, undefined))
        .toEqual([]);
      expect(OperatorPluginRegistry.getSpawnEnvExportKeys('unknown', undefined))
        .toEqual([]);
    });

    it('falls back to an empty list when the cann plugin is missing', () => {
      OperatorPluginRegistry.registerOpPlugin(new PyAscPlugin());

      expect(OperatorPluginRegistry.getSpawnEnvExportKeys(undefined, OperatorProjectType.ASCEND_C))
        .toEqual([]);
    });

    it('falls back to an empty list when the op plugin exports no keys', () => {
      const fake = {
        opType: 'cann',
        getSpawnEnvExportKeys: jest.fn(() => undefined),
      } as unknown as IOperatorPlugin;

      OperatorPluginRegistry.registerOpPlugin(fake);

      expect(OperatorPluginRegistry.getSpawnEnvExportKeys('cann', undefined))
        .toEqual([]);
    });
  });

  describe('filterSpawnEnv', () => {
    it('drops keys whose values are empty or whitespace-only', () => {
      registerDefaultPlugins();

      expect(OperatorPluginRegistry.filterSpawnEnv({
        SOC_VERSION: '',
        NPU_ARCH: '   ',
      }, 'cann', undefined))
        .toEqual({});
      expect(OperatorPluginRegistry.filterSpawnEnv({
        SOC_VERSION: 'ascend910b',
        NPU_ARCH: '',
      }, 'cann', undefined))
        .toEqual({ SOC_VERSION: 'ascend910b' });
    });
  });

  describe('isProjectTypeSupported', () => {
    it('rejects missing or blank project types', () => {
      registerDefaultPlugins();

      expect(OperatorPluginRegistry.isProjectTypeSupported(undefined))
        .toBe(false);
      expect(OperatorPluginRegistry.isProjectTypeSupported(''))
        .toBe(false);
      expect(OperatorPluginRegistry.isProjectTypeSupported('   '))
        .toBe(false);
    });

    it('accepts an op type or a mapped project type', () => {
      registerDefaultPlugins();

      expect(OperatorPluginRegistry.isProjectTypeSupported('cann'))
        .toBe(true);
      expect(OperatorPluginRegistry.isProjectTypeSupported('standard-custom'))
        .toBe(true);
    });

    it('rejects unknown project types', () => {
      registerDefaultPlugins();

      expect(OperatorPluginRegistry.isProjectTypeSupported('mystery'))
        .toBe(false);
    });
  });

  describe('getRegisteredOpTypes', () => {
    it('lists registered op types in registration order', () => {
      OperatorPluginRegistry.registerOpPlugin(new CannPlugin());
      OperatorPluginRegistry.registerOpPlugin(new TritonPlugin());

      expect(OperatorPluginRegistry.getRegisteredOpTypes())
        .toEqual([
          'cann',
          'triton',
        ]);
    });
  });
});
